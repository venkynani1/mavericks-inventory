import "server-only"
import { Prisma, type RequestType } from "@prisma/client"
import { prisma } from "@/lib/db"
import { rolesForLevel } from "@/lib/roles"
import { audit } from "./audit"
import { AppError, type SessionUser } from "./session"
import { getSettings, levelsFor } from "./settings"

type Tx = Prisma.TransactionClient

const PREFIX: Record<RequestType, string> = {
  STOCK_MASTER: "STK",
  RECEIPT: "RCV",
  DISTRIBUTION: "DST",
}

/** Atomic, gap-tolerant request number: MI-DST-2026-000123 */
export async function nextRequestNumber(tx: Tx, type: RequestType) {
  const year = new Date().getFullYear()
  const key = `req:${PREFIX[type]}:${year}`
  const c = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  })
  return `MI-${PREFIX[type]}-${year}-${String(c.value).padStart(6, "0")}`
}

export async function nextStockCode(tx: Tx) {
  const c = await tx.counter.upsert({
    where: { key: "stock-code" },
    create: { key: "stock-code", value: 1 },
    update: { value: { increment: 1 } },
  })
  return `MAV-${String(c.value).padStart(5, "0")}`
}

/** Re-totals a request after its lines change. */
export async function recomputeTotals(tx: Tx, requestId: string) {
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId }, select: { type: true } })
  let totalQty = 0
  let lineCount = 0
  if (req.type === "DISTRIBUTION") {
    const agg = await tx.distributionLine.aggregate({ where: { requestId }, _sum: { quantity: true }, _count: true })
    totalQty = agg._sum.quantity ?? 0
    lineCount = agg._count
  } else if (req.type === "RECEIPT") {
    const agg = await tx.receiptLine.aggregate({ where: { requestId }, _sum: { quantity: true }, _count: true })
    totalQty = agg._sum.quantity ?? 0
    lineCount = agg._count
  } else {
    const agg = await tx.stockItem.aggregate({
      where: { requestId, status: { not: "INACTIVE" } },
      _sum: { openingQty: true },
      _count: true,
    })
    totalQty = agg._sum.openingQty ?? 0
    lineCount = agg._count
  }
  await tx.request.update({ where: { id: requestId }, data: { totalQty, lineCount } })
  return { totalQty, lineCount }
}

/** Quantity needed per stock item for a distribution request. */
async function demandByItem(tx: Tx, requestId: string) {
  const rows = await tx.distributionLine.groupBy({
    by: ["stockItemId"],
    where: { requestId },
    _sum: { quantity: true },
  })
  return rows.map((r) => ({ stockItemId: r.stockItemId, qty: r._sum.quantity ?? 0 }))
}

/** Returns human-readable shortfalls, empty when every line can be served. */
export async function availabilityShortfalls(tx: Tx, requestId: string) {
  const demand = await demandByItem(tx, requestId)
  if (!demand.length) return []
  const items = await tx.stockItem.findMany({
    where: { id: { in: demand.map((d) => d.stockItemId) } },
    select: { id: true, code: true, name: true, availableQty: true, status: true },
  })
  const byId = new Map(items.map((i) => [i.id, i]))
  const issues: string[] = []
  for (const d of demand) {
    const it = byId.get(d.stockItemId)
    if (!it) continue
    if (it.status !== "ACTIVE") issues.push(`${it.code} ${it.name} is not an active stock item`)
    else if (d.qty > it.availableQty)
      issues.push(`${it.code} ${it.name}: needs ${d.qty}, only ${it.availableQty} available`)
  }
  return issues
}

function assertEditable(req: { status: string; createdById: string }, user: SessionUser) {
  if (req.createdById !== user.id) throw new AppError("Only the person who created this request can change it.", 403)
  if (req.status !== "DRAFT" && req.status !== "REJECTED")
    throw new AppError("Only draft or rejected requests can be edited.", 409)
}

export async function loadEditableRequest(tx: Tx, id: string, user: SessionUser) {
  const req = await tx.request.findUnique({ where: { id } })
  if (!req) throw new AppError("Request not found.", 404)
  assertEditable(req, user)
  return req
}

export async function submitRequest(id: string, user: SessionUser, remarks?: string) {
  const settings = await getSettings()
  return prisma.$transaction(async (tx) => {
    const req = await loadEditableRequest(tx, id, user)
    const { totalQty, lineCount } = await recomputeTotals(tx, id)
    if (lineCount === 0) throw new AppError("Add at least one line before submitting.")
    if (req.type === "DISTRIBUTION" && settings.preventNegativeStock) {
      const issues = await availabilityShortfalls(tx, id)
      if (issues.length) throw new AppError(`Not enough stock. ${issues.slice(0, 3).join("; ")}${issues.length > 3 ? ` and ${issues.length - 3} more` : ""}.`, 409)
    }
    const wasRejected = req.status === "REJECTED"
    const updated = await tx.request.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        currentLevel: 0,
        requiredLevel: levelsFor(settings, totalQty),
        decidedAt: null,
      },
    })
    await tx.approvalEvent.create({
      data: { requestId: id, action: wasRejected ? "RESUBMITTED" : "SUBMITTED", level: 0, actorId: user.id, remarks: remarks || null },
    })
    await audit(tx, {
      actorId: user.id,
      action: "REQUEST.SUBMIT",
      entity: "Request",
      entityId: id,
      summary: `${wasRejected ? "Resubmitted" : "Submitted"} ${req.number} (${lineCount} lines, ${totalQty} units)`,
    })
    return updated
  })
}

export async function approveRequest(id: string, user: SessionUser, remarks?: string) {
  const settings = await getSettings()
  return prisma.$transaction(
    async (tx) => {
      // Row lock: two approvers clicking at once can't both finalise.
      await tx.$queryRaw`SELECT id FROM "Request" WHERE id = ${id} FOR UPDATE`
      const req = await tx.request.findUnique({ where: { id }, include: { events: true } })
      if (!req) throw new AppError("Request not found.", 404)
      if (req.status !== "SUBMITTED") throw new AppError("This request is no longer waiting for approval.", 409)
      if (req.createdById === user.id) throw new AppError("You created this request, so someone else has to approve it.", 403)
      const level = req.currentLevel + 1
      if (!rolesForLevel(level).includes(user.role))
        throw new AppError(level === 1 ? "Level 1 needs a Manager or Management Authority." : "Level 2 needs a Management Authority.", 403)
      const approvedThisRound = req.events.filter(
        (e) => e.action === "APPROVED" && req.submittedAt && e.createdAt >= req.submittedAt,
      )
      if (approvedThisRound.some((e) => e.actorId === user.id))
        throw new AppError("You already approved an earlier level. A different approver must sign off.", 403)

      await tx.approvalEvent.create({ data: { requestId: id, action: "APPROVED", level, actorId: user.id, remarks: remarks || null } })
      const final = level >= req.requiredLevel
      if (!final) {
        await tx.request.update({ where: { id }, data: { currentLevel: level } })
        await audit(tx, { actorId: user.id, action: "REQUEST.APPROVE", entity: "Request", entityId: id, summary: `Approved ${req.number} at level ${level}; waiting for level ${level + 1}` })
        return { final: false, level }
      }

      await postToStock(tx, req.id, req.type, user, settings.preventNegativeStock)
      await tx.request.update({ where: { id }, data: { currentLevel: level, status: "APPROVED", decidedAt: new Date() } })
      await audit(tx, { actorId: user.id, action: "REQUEST.APPROVE", entity: "Request", entityId: id, summary: `Final approval of ${req.number}; stock updated` })
      return { final: true, level }
    },
    { timeout: 60_000, maxWait: 10_000 },
  )
}

export async function rejectRequest(id: string, user: SessionUser, remarks: string) {
  if (!remarks?.trim()) throw new AppError("Add a remark explaining why you're rejecting this request.")
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Request" WHERE id = ${id} FOR UPDATE`
    const req = await tx.request.findUnique({ where: { id } })
    if (!req) throw new AppError("Request not found.", 404)
    if (req.status !== "SUBMITTED") throw new AppError("This request is no longer waiting for approval.", 409)
    if (req.createdById === user.id) throw new AppError("You can't reject your own request. Edit or cancel it instead.", 403)
    const level = req.currentLevel + 1
    if (!rolesForLevel(level).includes(user.role)) throw new AppError("Your role can't act at this approval level.", 403)
    await tx.approvalEvent.create({ data: { requestId: id, action: "REJECTED", level, actorId: user.id, remarks: remarks.trim() } })
    await tx.request.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date(), currentLevel: 0 } })
    await audit(tx, { actorId: user.id, action: "REQUEST.REJECT", entity: "Request", entityId: id, summary: `Rejected ${req.number}: ${remarks.trim()}` })
  })
}

/** Draft-only "delete". Transactional data is never hard-deleted, so the request is marked Cancelled. */
export async function cancelRequest(id: string, user: SessionUser) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.request.findUnique({ where: { id } })
    if (!req) throw new AppError("Request not found.", 404)
    if (req.createdById !== user.id) throw new AppError("Only the creator can delete this draft.", 403)
    if (req.status !== "DRAFT") throw new AppError("Only drafts can be deleted.", 409)
    await tx.request.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() } })
    if (req.type === "STOCK_MASTER") {
      await tx.stockItem.updateMany({ where: { requestId: id, status: "DRAFT" }, data: { status: "INACTIVE", deletedAt: new Date() } })
    }
    await tx.approvalEvent.create({ data: { requestId: id, action: "CANCELLED", level: 0, actorId: user.id } })
    await audit(tx, { actorId: user.id, action: "REQUEST.CANCEL", entity: "Request", entityId: id, summary: `Deleted draft ${req.number}` })
  })
}

/**
 * Applies an approved request to stock balances and writes the movement ledger.
 * Runs inside the approval transaction so balances and ledger can never drift apart.
 */
async function postToStock(tx: Tx, requestId: string, type: RequestType, user: SessionUser, preventNegative: boolean) {
  if (type === "STOCK_MASTER") {
    const items = await tx.stockItem.findMany({ where: { requestId, status: "DRAFT" } })
    for (const it of items) {
      await tx.stockItem.update({
        where: { id: it.id },
        data: { status: "ACTIVE", availableQty: it.openingQty, receivedQty: 0, distributedQty: 0 },
      })
      await tx.ledgerEntry.create({
        data: { stockItemId: it.id, requestId, type: "OPENING", qtyIn: it.openingQty, balanceAfter: it.openingQty, actorId: user.id, note: "Opening quantity" },
      })
    }
    return
  }

  if (type === "RECEIPT") {
    const lines = await tx.receiptLine.groupBy({ by: ["stockItemId"], where: { requestId }, _sum: { quantity: true } })
    for (const l of lines) {
      const qty = l._sum.quantity ?? 0
      const it = await tx.stockItem.update({
        where: { id: l.stockItemId },
        data: { receivedQty: { increment: qty }, availableQty: { increment: qty } },
      })
      await tx.ledgerEntry.create({
        data: { stockItemId: l.stockItemId, requestId, type: "RECEIPT", qtyIn: qty, balanceAfter: it.availableQty, actorId: user.id },
      })
    }
    return
  }

  const demand = await demandByItem(tx, requestId)
  for (const d of demand) {
    if (preventNegative) {
      // Conditional decrement: zero rows updated means stock ran out since submission.
      const n = await tx.$executeRaw`
        UPDATE "StockItem"
        SET "availableQty" = "availableQty" - ${d.qty}, "distributedQty" = "distributedQty" + ${d.qty}, "updatedAt" = now()
        WHERE id = ${d.stockItemId} AND status = 'ACTIVE' AND "availableQty" >= ${d.qty}`
      if (n === 0) {
        const it = await tx.stockItem.findUnique({ where: { id: d.stockItemId }, select: { code: true, name: true, availableQty: true } })
        throw new AppError(`Can't approve: ${it?.code} ${it?.name} needs ${d.qty} but only ${it?.availableQty ?? 0} are available now.`, 409)
      }
    } else {
      await tx.stockItem.update({
        where: { id: d.stockItemId },
        data: { availableQty: { decrement: d.qty }, distributedQty: { increment: d.qty } },
      })
    }
    const it = await tx.stockItem.findUniqueOrThrow({ where: { id: d.stockItemId }, select: { availableQty: true } })
    await tx.ledgerEntry.create({
      data: { stockItemId: d.stockItemId, requestId, type: "DISTRIBUTION", qtyOut: d.qty, balanceAfter: it.availableQty, actorId: user.id },
    })
  }
}

export function isOverdue(submittedAt: Date | null, hours: number) {
  if (!submittedAt) return false
  return Date.now() - new Date(submittedAt).getTime() > hours * 3600_000
}
