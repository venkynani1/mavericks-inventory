import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { fmtDate, fmtDateTime } from "@/lib/utils"
import { getSettings } from "./settings"
import { isOverdue } from "./workflow"

export type ReportKey = "availability" | "distributed" | "pending" | "approvals" | "ledger"
export type Filters = { q?: string; from?: string; to?: string; category?: string; item?: string; purpose?: string; location?: string; stock?: string }
export type ReportColumn = { key: string; header: string; width?: number; align?: "right"; numeric?: boolean }
export type ReportResult = { title: string; columns: ReportColumn[]; rows: Record<string, string | number | null>[]; total: number; summary?: { label: string; value: string }[] }

export const REPORTS: { key: ReportKey; title: string; description: string }[] = [
  { key: "availability", title: "Current stock availability", description: "Opening, received, distributed and available quantity for every active item." },
  { key: "distributed", title: "Distributed stock", description: "Every approved handover, with recipient, purpose and location." },
  { key: "pending", title: "Pending approval", description: "Requests waiting for a decision, with their age and level." },
  { key: "approvals", title: "Approval history", description: "Every submission, approval and rejection, with remarks." },
  { key: "ledger", title: "Stock movement ledger", description: "Each stock movement in date order, with the running balance." },
]

const range = (from?: string, to?: string) => {
  const r: { gte?: Date; lte?: Date } = {}
  if (from) r.gte = new Date(`${from}T00:00:00+05:30`)
  if (to) r.lte = new Date(`${to}T23:59:59+05:30`)
  return Object.keys(r).length ? r : undefined
}

const TYPE_LABEL = { STOCK_MASTER: "New stock items", RECEIPT: "Stock inward", DISTRIBUTION: "Distribution" } as const

export async function runReport(key: ReportKey, f: Filters, limit = 100_000): Promise<ReportResult> {
  const meta = REPORTS.find((r) => r.key === key)!
  switch (key) {
    case "availability": {
      const where: Prisma.StockItemWhereInput = { status: "ACTIVE" }
      if (f.category) where.categoryId = f.category
      if (f.q) where.OR = [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }]
      let items = await prisma.stockItem.findMany({ where, include: { category: true }, orderBy: [{ product: "asc" }, { name: "asc" }], take: limit })
      if (f.stock === "low") items = items.filter((i) => i.availableQty > 0 && i.availableQty <= i.reorderLevel)
      if (f.stock === "out") items = items.filter((i) => i.availableQty <= 0)
      const sum = (k: "openingQty" | "receivedQty" | "distributedQty" | "availableQty") => items.reduce((s, i) => s + i[k], 0)
      return {
        title: meta.title,
        columns: [
          { key: "code", header: "Stock code", width: 13 },
          { key: "name", header: "Item", width: 44 },
          { key: "category", header: "Category", width: 14 },
          { key: "opening", header: "Opening", numeric: true, align: "right" },
          { key: "received", header: "Received", numeric: true, align: "right" },
          { key: "distributed", header: "Distributed", numeric: true, align: "right" },
          { key: "available", header: "Available", numeric: true, align: "right" },
          { key: "reorder", header: "Reorder at", numeric: true, align: "right" },
          { key: "state", header: "Status", width: 12 },
        ],
        rows: items.map((i) => ({
          code: i.code, name: i.name, category: i.category.name, opening: i.openingQty, received: i.receivedQty, distributed: i.distributedQty, available: i.availableQty, reorder: i.reorderLevel,
          state: i.availableQty <= 0 ? "Out of stock" : i.availableQty <= i.reorderLevel ? "Low" : "In stock",
        })),
        total: items.length,
        summary: [
          { label: "Items", value: String(items.length) },
          { label: "Opening + received", value: String(sum("openingQty") + sum("receivedQty")) },
          { label: "Distributed", value: String(sum("distributedQty")) },
          { label: "Available", value: String(sum("availableQty")) },
        ],
      }
    }
    case "distributed": {
      const where: Prisma.DistributionLineWhereInput = { request: { status: "APPROVED" } }
      const dr = range(f.from, f.to)
      if (dr) where.distributedOn = dr
      if (f.item) where.stockItemId = f.item
      if (f.purpose) where.purpose = f.purpose
      if (f.location) where.location = f.location
      if (f.category) where.stockItem = { categoryId: f.category }
      if (f.q) where.OR = [{ recipientName: { contains: f.q, mode: "insensitive" } }, { recipientId: { contains: f.q } }]
      const [rows, total, agg] = await Promise.all([
        prisma.distributionLine.findMany({ where, include: { stockItem: true, request: true }, orderBy: [{ distributedOn: "desc" }, { createdAt: "desc" }], take: limit }),
        prisma.distributionLine.count({ where }),
        prisma.distributionLine.aggregate({ where, _sum: { quantity: true } }),
      ])
      return {
        title: meta.title,
        columns: [
          { key: "date", header: "Date", width: 13 },
          { key: "number", header: "Request", width: 20 },
          { key: "code", header: "Stock code", width: 12 },
          { key: "item", header: "Item", width: 40 },
          { key: "qty", header: "Qty", numeric: true, align: "right" },
          { key: "empId", header: "Emp ID", width: 13 },
          { key: "recipient", header: "Recipient", width: 24 },
          { key: "location", header: "Location", width: 12 },
          { key: "purpose", header: "Purpose", width: 22 },
          { key: "poc", header: "POC", width: 14 },
        ],
        rows: rows.map((l) => ({
          date: fmtDate(l.distributedOn), number: l.request.number, code: l.stockItem.code, item: l.stockItem.name, qty: l.quantity, empId: l.recipientId, recipient: l.recipientName,
          location: l.location, purpose: l.purpose, poc: l.poc,
        })),
        total,
        summary: [
          { label: "Lines", value: String(total) },
          { label: "Units distributed", value: String(agg._sum.quantity ?? 0) },
        ],
      }
    }
    case "pending": {
      const settings = await getSettings()
      const reqs = await prisma.request.findMany({ where: { status: "SUBMITTED" }, include: { createdBy: true }, orderBy: { submittedAt: "asc" }, take: limit })
      return {
        title: meta.title,
        columns: [
          { key: "number", header: "Request", width: 20 },
          { key: "type", header: "Type", width: 16 },
          { key: "title", header: "Title", width: 36 },
          { key: "maker", header: "Submitted by", width: 18 },
          { key: "submitted", header: "Submitted", width: 20 },
          { key: "level", header: "Level", width: 9 },
          { key: "lines", header: "Lines", numeric: true, align: "right" },
          { key: "qty", header: "Units", numeric: true, align: "right" },
          { key: "age", header: "Waiting (h)", numeric: true, align: "right" },
          { key: "overdue", header: "Overdue", width: 9 },
        ],
        rows: reqs.map((r) => ({
          number: r.number, type: TYPE_LABEL[r.type], title: r.title, maker: r.createdBy.name, submitted: fmtDateTime(r.submittedAt), level: `${r.currentLevel + 1} of ${r.requiredLevel}`,
          lines: r.lineCount, qty: r.totalQty, age: r.submittedAt ? Math.round((Date.now() - r.submittedAt.getTime()) / 3600_000) : 0, overdue: isOverdue(r.submittedAt, settings.escalationHours) ? "Yes" : "No",
        })),
        total: reqs.length,
      }
    }
    case "approvals": {
      const where: Prisma.ApprovalEventWhereInput = {}
      const dr = range(f.from, f.to)
      if (dr) where.createdAt = dr
      if (f.q) where.request = { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { title: { contains: f.q, mode: "insensitive" } }] }
      const [rows, total] = await Promise.all([
        prisma.approvalEvent.findMany({ where, include: { request: true, actor: true }, orderBy: { createdAt: "desc" }, take: limit }),
        prisma.approvalEvent.count({ where }),
      ])
      const ACTION = { SUBMITTED: "Submitted", RESUBMITTED: "Resubmitted", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Draft deleted" } as const
      return {
        title: meta.title,
        columns: [
          { key: "at", header: "When", width: 20 },
          { key: "number", header: "Request", width: 20 },
          { key: "type", header: "Type", width: 16 },
          { key: "action", header: "Action", width: 13 },
          { key: "level", header: "Level", width: 7 },
          { key: "actor", header: "By", width: 18 },
          { key: "remarks", header: "Remarks", width: 44 },
        ],
        rows: rows.map((e) => ({ at: fmtDateTime(e.createdAt), number: e.request.number, type: TYPE_LABEL[e.request.type], action: ACTION[e.action], level: e.level || "", actor: e.actor.name, remarks: e.remarks })),
        total,
      }
    }
    case "ledger": {
      const where: Prisma.LedgerEntryWhereInput = {}
      const dr = range(f.from, f.to)
      if (dr) where.createdAt = dr
      if (f.item) where.stockItemId = f.item
      if (f.category) where.stockItem = { categoryId: f.category }
      const [rows, total] = await Promise.all([
        prisma.ledgerEntry.findMany({ where, include: { stockItem: true, request: true, actor: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit }),
        prisma.ledgerEntry.count({ where }),
      ])
      const T = { OPENING: "Opening", RECEIPT: "Inward", DISTRIBUTION: "Distribution", ADJUSTMENT: "Adjustment" } as const
      return {
        title: meta.title,
        columns: [
          { key: "at", header: "Posted", width: 20 },
          { key: "code", header: "Stock code", width: 12 },
          { key: "item", header: "Item", width: 40 },
          { key: "type", header: "Movement", width: 13 },
          { key: "number", header: "Request", width: 20 },
          { key: "in", header: "In", numeric: true, align: "right" },
          { key: "out", header: "Out", numeric: true, align: "right" },
          { key: "balance", header: "Balance", numeric: true, align: "right" },
          { key: "by", header: "Approved by", width: 18 },
        ],
        rows: rows.map((l) => ({ at: fmtDateTime(l.createdAt), code: l.stockItem.code, item: l.stockItem.name, type: T[l.type], number: l.request?.number ?? "", in: l.qtyIn || null, out: l.qtyOut || null, balance: l.balanceAfter, by: l.actor.name })),
        total,
      }
    }
  }
}
