"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { run } from "@/lib/server/action"
import { audit } from "@/lib/server/audit"
import { AppError, assertPermission, getUser } from "@/lib/server/session"
import {
  approveRequest,
  cancelRequest,
  loadEditableRequest,
  nextRequestNumber,
  recomputeTotals,
  rejectRequest,
  submitRequest,
} from "@/lib/server/workflow"

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
const toDate = (s: string) => new Date(`${s}T12:00:00+05:30`)
const notFuture = (s: string) => toDate(s).getTime() <= Date.now() + 86400_000

const distLine = z.object({
  stockItemId: z.string().min(1, "Choose an item"),
  quantity: z.coerce.number().int("Whole numbers only").min(1, "At least 1"),
  distributedOn: dateStr.refine(notFuture, "Date can't be in the future"),
  recipientId: z.string().trim().max(30).optional(),
  recipientName: z.string().trim().min(2, "Enter the recipient's name").max(120),
  location: z.string().trim().max(60).optional(),
  purpose: z.string().trim().max(80).optional(),
  poc: z.string().trim().max(80).optional(),
  remarks: z.string().trim().max(300).optional(),
})
export type DistLineInput = z.input<typeof distLine>

const receiptLine = z.object({
  stockItemId: z.string().min(1, "Choose an item"),
  quantity: z.coerce.number().int("Whole numbers only").min(1, "At least 1"),
  receivedOn: dateStr.refine(notFuture, "Date can't be in the future"),
  remarks: z.string().trim().max(300).optional(),
})
export type ReceiptLineInput = z.input<typeof receiptLine>

const meta = z.object({ title: z.string().trim().min(3, "Give the request a title").max(120), purpose: z.string().trim().max(120).optional(), remarks: z.string().trim().max(500).optional() })

function check<T>(schema: z.ZodType<T>, v: unknown, label = ""): T {
  const r = schema.safeParse(v)
  if (!r.success) throw new AppError(`${label}${r.error.issues[0].message}`)
  return r.data
}
const opt = (s?: string) => (s && s.trim() ? s.trim() : null)

async function activeItems(ids: string[]) {
  const items = await prisma.stockItem.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true } })
  if (items.length !== new Set(ids).size) throw new AppError("One of the chosen items isn't active any more. Refresh and choose again.")
}

function refresh(id?: string) {
  revalidatePath("/requests")
  revalidatePath("/approvals")
  revalidatePath("/")
  if (id) revalidatePath(`/requests/${id}`)
}

// ---------- create ----------

export async function createDistribution(input: { title: string; purpose?: string; remarks?: string; lines: DistLineInput[]; submit?: boolean }) {
  return run(async () => {
    const user = await assertPermission("request:create")
    const m = check(meta, input)
    if (!input.lines?.length) throw new AppError("Add at least one item.")
    const lines = input.lines.map((l, i) => check(distLine, l, `Line ${i + 1}: `))
    await activeItems(lines.map((l) => l.stockItemId))
    const req = await prisma.$transaction(async (tx) => {
      const r = await tx.request.create({
        data: { number: await nextRequestNumber(tx, "DISTRIBUTION"), type: "DISTRIBUTION", title: m.title, purpose: opt(m.purpose), remarks: opt(m.remarks), createdById: user.id },
      })
      await tx.distributionLine.createMany({
        data: lines.map((l) => ({
          requestId: r.id, stockItemId: l.stockItemId, quantity: l.quantity, distributedOn: toDate(l.distributedOn),
          recipientId: opt(l.recipientId), recipientName: l.recipientName, location: opt(l.location), purpose: opt(l.purpose) ?? opt(m.purpose), poc: opt(l.poc) ?? user.name, remarks: opt(l.remarks),
        })),
      })
      await recomputeTotals(tx, r.id)
      await audit(tx, { actorId: user.id, action: "DISTRIBUTION.CREATE", entity: "Request", entityId: r.id, summary: `Created draft ${r.number} with ${lines.length} lines` })
      return r
    })
    if (input.submit) await submitRequest(req.id, user)
    refresh(req.id)
    return { id: req.id, number: req.number }
  }, input.submit ? "Submitted for approval" : "Draft saved")
}

export async function createReceipt(input: { title: string; purpose?: string; remarks?: string; lines: ReceiptLineInput[]; submit?: boolean }) {
  return run(async () => {
    const user = await assertPermission("request:create")
    const m = check(meta, input)
    if (!input.lines?.length) throw new AppError("Add at least one item.")
    const lines = input.lines.map((l, i) => check(receiptLine, l, `Line ${i + 1}: `))
    await activeItems(lines.map((l) => l.stockItemId))
    const req = await prisma.$transaction(async (tx) => {
      const r = await tx.request.create({
        data: { number: await nextRequestNumber(tx, "RECEIPT"), type: "RECEIPT", title: m.title, purpose: opt(m.purpose), remarks: opt(m.remarks), createdById: user.id },
      })
      await tx.receiptLine.createMany({
        data: lines.map((l) => ({ requestId: r.id, stockItemId: l.stockItemId, quantity: l.quantity, receivedOn: toDate(l.receivedOn), remarks: opt(l.remarks) })),
      })
      await recomputeTotals(tx, r.id)
      await audit(tx, { actorId: user.id, action: "RECEIPT.CREATE", entity: "Request", entityId: r.id, summary: `Created draft ${r.number} with ${lines.length} lines` })
      return r
    })
    if (input.submit) await submitRequest(req.id, user)
    refresh(req.id)
    return { id: req.id, number: req.number }
  }, input.submit ? "Submitted for approval" : "Draft saved")
}

// ---------- edit draft / rejected ----------

export async function updateRequestMeta(id: string, input: { title: string; purpose?: string; remarks?: string }) {
  return run(async () => {
    const user = await assertPermission("request:create")
    const m = check(meta, input)
    await prisma.$transaction(async (tx) => {
      const before = await loadEditableRequest(tx, id, user)
      const after = await tx.request.update({ where: { id }, data: { title: m.title, purpose: opt(m.purpose), remarks: opt(m.remarks) } })
      await audit(tx, { actorId: user.id, action: "REQUEST.UPDATE", entity: "Request", entityId: id, summary: `Edited details of ${before.number}`, before, after })
    })
    refresh(id)
  }, "Details saved")
}

export async function saveDistributionLine(requestId: string, lineId: string | null, input: DistLineInput) {
  return run(async () => {
    const user = await assertPermission("request:create")
    const l = check(distLine, input)
    await activeItems([l.stockItemId])
    await prisma.$transaction(async (tx) => {
      const req = await loadEditableRequest(tx, requestId, user)
      if (req.type !== "DISTRIBUTION") throw new AppError("This isn't a distribution request.")
      const data = {
        stockItemId: l.stockItemId, quantity: l.quantity, distributedOn: toDate(l.distributedOn), recipientId: opt(l.recipientId), recipientName: l.recipientName,
        location: opt(l.location), purpose: opt(l.purpose), poc: opt(l.poc), remarks: opt(l.remarks),
      }
      if (lineId) {
        const before = await tx.distributionLine.findFirst({ where: { id: lineId, requestId } })
        if (!before) throw new AppError("Line not found.")
        const after = await tx.distributionLine.update({ where: { id: lineId }, data })
        await audit(tx, { actorId: user.id, action: "DISTRIBUTION.LINE_UPDATE", entity: "DistributionLine", entityId: lineId, summary: `Edited a line on ${req.number}`, before, after })
      } else {
        const after = await tx.distributionLine.create({ data: { ...data, requestId } })
        await audit(tx, { actorId: user.id, action: "DISTRIBUTION.LINE_ADD", entity: "DistributionLine", entityId: after.id, summary: `Added a line to ${req.number}`, after })
      }
      await recomputeTotals(tx, requestId)
    })
    refresh(requestId)
  }, lineId ? "Line updated" : "Line added")
}

export async function saveReceiptLine(requestId: string, lineId: string | null, input: ReceiptLineInput) {
  return run(async () => {
    const user = await assertPermission("request:create")
    const l = check(receiptLine, input)
    await activeItems([l.stockItemId])
    await prisma.$transaction(async (tx) => {
      const req = await loadEditableRequest(tx, requestId, user)
      if (req.type !== "RECEIPT") throw new AppError("This isn't a stock inward request.")
      const data = { stockItemId: l.stockItemId, quantity: l.quantity, receivedOn: toDate(l.receivedOn), remarks: opt(l.remarks) }
      if (lineId) {
        const before = await tx.receiptLine.findFirst({ where: { id: lineId, requestId } })
        if (!before) throw new AppError("Line not found.")
        const after = await tx.receiptLine.update({ where: { id: lineId }, data })
        await audit(tx, { actorId: user.id, action: "RECEIPT.LINE_UPDATE", entity: "ReceiptLine", entityId: lineId, summary: `Edited a line on ${req.number}`, before, after })
      } else {
        const after = await tx.receiptLine.create({ data: { ...data, requestId } })
        await audit(tx, { actorId: user.id, action: "RECEIPT.LINE_ADD", entity: "ReceiptLine", entityId: after.id, summary: `Added a line to ${req.number}`, after })
      }
      await recomputeTotals(tx, requestId)
    })
    refresh(requestId)
  }, lineId ? "Line updated" : "Line added")
}

/** Removes lines from a draft/rejected request. The removed values are kept in the audit log. */
export async function removeLines(requestId: string, lineIds: string[]) {
  return run(async () => {
    const user = await assertPermission("request:create")
    await prisma.$transaction(async (tx) => {
      const req = await loadEditableRequest(tx, requestId, user)
      if (req.type === "DISTRIBUTION") {
        const before = await tx.distributionLine.findMany({ where: { requestId, id: { in: lineIds } } })
        await tx.distributionLine.deleteMany({ where: { requestId, id: { in: lineIds } } })
        await audit(tx, { actorId: user.id, action: "DISTRIBUTION.LINE_REMOVE", entity: "Request", entityId: requestId, summary: `Removed ${before.length} line(s) from ${req.number}`, before })
      } else if (req.type === "RECEIPT") {
        const before = await tx.receiptLine.findMany({ where: { requestId, id: { in: lineIds } } })
        await tx.receiptLine.deleteMany({ where: { requestId, id: { in: lineIds } } })
        await audit(tx, { actorId: user.id, action: "RECEIPT.LINE_REMOVE", entity: "Request", entityId: requestId, summary: `Removed ${before.length} line(s) from ${req.number}`, before })
      } else {
        const before = await tx.stockItem.findMany({ where: { requestId, id: { in: lineIds }, status: "DRAFT" } })
        await tx.stockItem.updateMany({ where: { requestId, id: { in: lineIds }, status: "DRAFT" }, data: { status: "INACTIVE", deletedAt: new Date() } })
        await audit(tx, { actorId: user.id, action: "STOCK_ITEM.DELETE", entity: "Request", entityId: requestId, summary: `Removed ${before.length} draft item(s) from ${req.number}`, before })
      }
      await recomputeTotals(tx, requestId)
    })
    refresh(requestId)
  }, "Removed")
}

// ---------- workflow ----------

export async function submit(id: string, remarks?: string) {
  return run(async () => {
    const user = await assertPermission("request:create")
    await submitRequest(id, user, remarks)
    refresh(id)
  }, "Submitted for approval")
}

export async function approve(id: string, remarks?: string) {
  return run(async () => {
    const user = await assertPermission("request:approve")
    const r = await approveRequest(id, user, remarks)
    refresh(id)
    revalidatePath("/stock")
    return r
  })
}

export async function reject(id: string, remarks: string) {
  return run(async () => {
    const user = await assertPermission("request:approve")
    await rejectRequest(id, user, remarks)
    refresh(id)
  }, "Rejected and returned to the executive")
}

/** Approve several requests from the queue; each is processed independently. */
export async function approveMany(ids: string[], remarks?: string) {
  return run(async () => {
    const user = await assertPermission("request:approve")
    const results: { id: string; ok: boolean; error?: string }[] = []
    for (const id of ids) {
      try {
        await approveRequest(id, user, remarks)
        results.push({ id, ok: true })
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : "Failed" })
      }
    }
    refresh()
    revalidatePath("/stock")
    return results
  })
}

export async function deleteDraft(id: string) {
  return run(async () => {
    const user = await getUser()
    if (!user) throw new AppError("Sign in again.")
    await cancelRequest(id, user)
    refresh(id)
  }, "Draft deleted")
}
