import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { fmtDate, fmtDateTime } from "@/lib/utils"
import { getSettings } from "./settings"
import { isOverdue } from "./workflow"

export type ReportKey = "availability" | "distributed" | "pending" | "approvals" | "ledger" | "points" | "attendance" | "rewards" | "prizes"
export type Filters = { q?: string; from?: string; to?: string; category?: string; item?: string; purpose?: string; location?: string; stock?: string; event?: string; status?: string; dept?: string }
export type ReportColumn = { key: string; header: string; width?: number; align?: "right"; numeric?: boolean }
export type ReportResult = { title: string; columns: ReportColumn[]; rows: Record<string, string | number | null>[]; total: number; summary?: { label: string; value: string }[] }

export const REPORTS: { key: ReportKey; title: string; description: string }[] = [
  { key: "availability", title: "Current stock availability", description: "Opening, received, distributed and available quantity for every active item." },
  { key: "distributed", title: "Distributed stock", description: "Every approved handover, with recipient, purpose and location." },
  { key: "pending", title: "Pending approval", description: "Requests waiting for a decision, with their age and level." },
  { key: "approvals", title: "Approval history", description: "Every submission, approval and rejection, with remarks." },
  { key: "ledger", title: "Stock movement ledger", description: "Each stock movement in date order, with the running balance." },
  { key: "points", title: "Employee points", description: "Every employee's current and lifetime points, events attended and rewards." },
  { key: "attendance", title: "Event attendance", description: "Who attended which event and the points they received." },
  { key: "rewards", title: "Points rewards", description: "Milestone rewards earned, with their status and the goodie handed over." },
  { key: "prizes", title: "Event prizes", description: "Winners and top performers with their prize (voucher, goodie or other), status and reference: the list finance needs." },
]

const range = (from?: string, to?: string) => {
  const r: { gte?: Date; lte?: Date } = {}
  if (from) r.gte = new Date(`${from}T00:00:00+05:30`)
  if (to) r.lte = new Date(`${to}T23:59:59+05:30`)
  return Object.keys(r).length ? r : undefined
}

const TYPE_LABEL = { STOCK_MASTER: "New stock items", RECEIPT: "Stock inward", DISTRIBUTION: "Distribution", STOCK_COUNT: "Stock count" } as const

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
    case "points": {
      const where: Prisma.EmployeeWhereInput = {}
      if (f.dept) where.department = f.dept
      if (f.q) where.OR = [{ name: { contains: f.q, mode: "insensitive" } }, { empId: { contains: f.q } }]
      const [rows, total] = await Promise.all([
        prisma.employee.findMany({ where, orderBy: [{ points: "desc" }, { name: "asc" }], take: limit, include: { _count: { select: { attendance: true } }, rewards: { select: { status: true } } } }),
        prisma.employee.count({ where }),
      ])
      return {
        title: meta.title,
        columns: [
          { key: "empId", header: "Emp ID", width: 13 },
          { key: "name", header: "Name", width: 26 },
          { key: "dept", header: "Department", width: 24 },
          { key: "location", header: "Location", width: 12 },
          { key: "points", header: "Points", numeric: true, align: "right" },
          { key: "lifetime", header: "Lifetime", numeric: true, align: "right" },
          { key: "cycle", header: "Cycle", numeric: true, align: "right" },
          { key: "events", header: "Events", numeric: true, align: "right" },
          { key: "issued", header: "Rewards issued", numeric: true, align: "right" },
          { key: "due", header: "Rewards due", numeric: true, align: "right" },
          { key: "active", header: "Active", width: 8 },
        ],
        rows: rows.map((e) => ({
          empId: e.empId, name: e.name, dept: e.department, location: e.location, points: e.points, lifetime: e.lifetimePoints, cycle: e.cycle, events: e._count.attendance,
          issued: e.rewards.filter((r) => r.status === "ISSUED").length, due: e.rewards.filter((r) => r.status === "DUE" || r.status === "IN_PROGRESS").length, active: e.active ? "Yes" : "No",
        })),
        total,
        summary: [
          { label: "Employees", value: String(total) },
          { label: "Points held", value: String(rows.reduce((s, e) => s + e.points, 0)) },
        ],
      }
    }
    case "attendance": {
      const where: Prisma.AttendanceWhereInput = {}
      if (f.event) where.eventId = f.event
      const dr = range(f.from, f.to)
      if (dr) where.event = { date: dr }
      if (f.q) where.employee = { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { empId: { contains: f.q } }] }
      const [rows, total, agg] = await Promise.all([
        prisma.attendance.findMany({ where, include: { event: { include: { eventType: true } }, employee: true }, orderBy: [{ event: { date: "desc" } }, { employee: { name: "asc" } }], take: limit }),
        prisma.attendance.count({ where }),
        prisma.attendance.aggregate({ where, _sum: { pointsAwarded: true } }),
      ])
      return {
        title: meta.title,
        columns: [
          { key: "date", header: "Date", width: 13 },
          { key: "code", header: "Event code", width: 14 },
          { key: "event", header: "Event", width: 36 },
          { key: "type", header: "Type", width: 18 },
          { key: "empId", header: "Emp ID", width: 13 },
          { key: "name", header: "Name", width: 24 },
          { key: "dept", header: "Department", width: 22 },
          { key: "points", header: "Points", numeric: true, align: "right" },
        ],
        rows: rows.map((a) => ({ date: fmtDate(a.event.date), code: a.event.code, event: a.event.name, type: a.event.eventType.name, empId: a.employee.empId, name: a.employee.name, dept: a.employee.department, points: a.pointsAwarded })),
        total,
        summary: [
          { label: "Attendances", value: String(total) },
          { label: "Points given", value: String(agg._sum.pointsAwarded ?? 0) },
        ],
      }
    }
    case "rewards": {
      const where: Prisma.RewardEarnedWhereInput = {}
      if (f.status && ["DUE", "IN_PROGRESS", "ISSUED", "CANCELLED"].includes(f.status)) where.status = f.status as "DUE"
      const dr = range(f.from, f.to)
      if (dr) where.earnedAt = dr
      if (f.q) where.employee = { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { empId: { contains: f.q } }] }
      const [rows, total] = await Promise.all([
        prisma.rewardEarned.findMany({ where, include: { employee: true, line: { include: { stockItem: true, request: true } } }, orderBy: [{ earnedAt: "desc" }], take: limit }),
        prisma.rewardEarned.count({ where }),
      ])
      const ST = { DUE: "Due", IN_PROGRESS: "In approval", ISSUED: "Issued", CANCELLED: "Cancelled" } as const
      return {
        title: meta.title,
        columns: [
          { key: "earned", header: "Earned", width: 13 },
          { key: "empId", header: "Emp ID", width: 13 },
          { key: "name", header: "Name", width: 24 },
          { key: "milestone", header: "Milestone", numeric: true, align: "right" },
          { key: "cycle", header: "Cycle", numeric: true, align: "right" },
          { key: "title", header: "Title", width: 14 },
          { key: "status", header: "Status", width: 12 },
          { key: "goodie", header: "Goodie", width: 30 },
          { key: "request", header: "Request", width: 20 },
          { key: "issued", header: "Issued", width: 13 },
        ],
        rows: rows.map((r) => ({ earned: fmtDate(r.earnedAt), empId: r.employee.empId, name: r.employee.name, milestone: r.threshold, cycle: r.cycle, title: r.title, status: ST[r.status], goodie: r.line?.stockItem.name ?? "", request: r.line?.request.number ?? "", issued: r.issuedAt ? fmtDate(r.issuedAt) : "" })),
        total,
      }
    }
    case "prizes": {
      const where: Prisma.EventAwardWhereInput = {}
      if (f.status && ["PENDING", "IN_APPROVAL", "ISSUED", "CANCELLED"].includes(f.status)) where.status = f.status as "PENDING"
      const dr = range(f.from, f.to)
      if (dr) where.event = { date: dr }
      if (f.q) where.OR = [{ employee: { name: { contains: f.q, mode: "insensitive" } } }, { employee: { empId: { contains: f.q } } }, { event: { name: { contains: f.q, mode: "insensitive" } } }]
      const [rows, total, sum] = await Promise.all([
        prisma.eventAward.findMany({ where, include: { employee: true, event: true, stockItem: true, line: { include: { request: true } } }, orderBy: [{ event: { date: "desc" } }, { createdAt: "asc" }], take: limit }),
        prisma.eventAward.count({ where }),
        prisma.eventAward.aggregate({ where: { ...where, kind: "VOUCHER", status: { not: "CANCELLED" } }, _sum: { voucherAmount: true } }),
      ])
      const ST = { PENDING: "To hand out", IN_APPROVAL: "In approval", ISSUED: "Issued", CANCELLED: "Cancelled" } as const
      const KIND = { GOODIE: "Goodie", VOUCHER: "Voucher", OTHER: "Other" } as const
      return {
        title: meta.title,
        columns: [
          { key: "date", header: "Event date", width: 13 },
          { key: "code", header: "Event code", width: 14 },
          { key: "event", header: "Event", width: 32 },
          { key: "position", header: "Position", width: 16 },
          { key: "empId", header: "Emp ID", width: 13 },
          { key: "name", header: "Name", width: 24 },
          { key: "kind", header: "Prize type", width: 10 },
          { key: "prize", header: "Prize", width: 32 },
          { key: "amount", header: "Voucher (₹)", numeric: true, align: "right" },
          { key: "bonus", header: "Bonus points", numeric: true, align: "right" },
          { key: "status", header: "Status", width: 12 },
          { key: "ref", header: "Reference / request", width: 24 },
          { key: "issued", header: "Issued", width: 13 },
        ],
        rows: rows.map((a) => ({
          date: fmtDate(a.event.date), code: a.event.code, event: a.event.name, position: a.position, empId: a.employee.empId, name: a.employee.name, kind: KIND[a.kind],
          prize: a.kind === "GOODIE" ? `${a.stockItem?.name ?? ""}${a.quantity > 1 ? ` x${a.quantity}` : ""}` : a.kind === "VOUCHER" ? `${a.voucherProvider ?? "Amazon"} voucher` : (a.description ?? ""),
          amount: a.voucherAmount, bonus: a.bonusPoints || null, status: ST[a.status], ref: a.line?.request.number ?? a.voucherRef ?? "", issued: a.issuedAt ? fmtDate(a.issuedAt) : "",
        })),
        total,
        summary: [
          { label: "Prizes", value: String(total) },
          { label: "Voucher value (₹)", value: String(sum._sum.voucherAmount ?? 0) },
        ],
      }
    }
  }
}
