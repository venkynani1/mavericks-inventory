import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { audit } from "./audit"
import { applyPoints } from "./rewards"
import { AppError, type SessionUser } from "./session"
import { getSettings } from "./settings"

/*
 * Points store. An administrator keeps a catalogue of goodies, each with a points price.
 * An employee fills a cart and places an order: the points are deducted at once (2,400 − 2,000 = 400).
 * The engagement team accepts the order and gives a pickup place, date and time (the goodies leave
 * stock then, with a ledger entry) or rejects it (points refunded). Finally the team marks it collected.
 */

type Tx = Prisma.TransactionClient

export const MAX_PER_LINE = 5

export async function nextOrderNumber(tx: Tx) {
  const year = new Date().getFullYear()
  const key = `redemption:${year}`
  const c = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } })
  return `RDM-${year}-${String(c.value).padStart(6, "0")}`
}

export async function storeCatalogue(opts: { activeOnly?: boolean } = {}) {
  return prisma.rewardCatalogItem.findMany({
    where: opts.activeOnly ? { active: true, stockItem: { status: "ACTIVE" } } : {},
    include: { stockItem: { select: { id: true, code: true, name: true, availableQty: true, status: true } } },
    orderBy: [{ pointsCost: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  })
}

export type CatalogInput = { name: string; description?: string; stockItemId: string; pointsCost: number; active: boolean }

export async function saveCatalogItem(id: string | null, input: CatalogInput, user: SessionUser) {
  const name = input.name?.trim()
  if (!name || name.length < 2 || name.length > 80) throw new AppError("Enter a name of 2 to 80 characters.")
  const cost = Math.trunc(Number(input.pointsCost))
  if (!(cost >= 1 && cost <= 1_000_000)) throw new AppError("Enter the points price (at least 1).")
  const item = await prisma.stockItem.findUnique({ where: { id: input.stockItemId ?? "" } })
  if (!item || item.status !== "ACTIVE") throw new AppError("Choose the stock item this goodie comes from.")
  const data = { name, description: input.description?.trim().slice(0, 300) || null, stockItemId: item.id, pointsCost: cost, active: !!input.active }
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.rewardCatalogItem.findUnique({ where: { id } }) : null
    if (id && !before) throw new AppError("That goodie no longer exists.", 404)
    const row = id ? await tx.rewardCatalogItem.update({ where: { id }, data }) : await tx.rewardCatalogItem.create({ data: { ...data, sortOrder: 100 } })
    await audit(tx, { actorId: user.id, action: id ? "STORE_ITEM.UPDATE" : "STORE_ITEM.CREATE", entity: "RewardCatalogItem", entityId: row.id, summary: `${row.name}: ${row.pointsCost.toLocaleString("en-IN")} points${row.active ? "" : " (hidden)"}`, before, after: row })
    return row
  })
}

export type CartLine = { catalogItemId: string; quantity: number }

/** Places an order from the cart and deducts the points straight away. */
export async function placeOrder(employeeId: string, cart: CartLine[], note: string | undefined, user: SessionUser) {
  const settings = await getSettings()
  if (settings.rewardMode !== "store") throw new AppError("The points store is switched off. Rewards are handed out at milestones instead.", 409)
  if (!cart?.length) throw new AppError("Your cart is empty.")
  const qty = new Map<string, number>()
  for (const l of cart) {
    const q = Math.trunc(Number(l.quantity))
    if (!(q >= 1)) throw new AppError("Quantities must be at least 1.")
    qty.set(l.catalogItemId, (qty.get(l.catalogItemId) ?? 0) + q)
  }
  for (const q of qty.values()) if (q > MAX_PER_LINE) throw new AppError(`You can order at most ${MAX_PER_LINE} of one goodie at a time.`)
  return prisma.$transaction(async (tx) => {
    const items = await tx.rewardCatalogItem.findMany({ where: { id: { in: [...qty.keys()] } }, include: { stockItem: true } })
    if (items.length !== qty.size || items.some((i) => !i.active || i.stockItem.status !== "ACTIVE"))
      throw new AppError("One of the goodies in your cart isn't available any more. Refresh the store and try again.", 409)
    // Goodies already promised to other open orders (placed, not yet accepted) are counted as taken.
    const reserved = await tx.redemptionLine.groupBy({ by: ["stockItemId"], where: { stockItemId: { in: items.map((i) => i.stockItemId) }, order: { status: "PLACED" } }, _sum: { quantity: true } })
    for (const i of items) {
      const want = qty.get(i.id)! + (items.filter((o) => o.id !== i.id && o.stockItemId === i.stockItemId).reduce((s, o) => s + qty.get(o.id)!, 0))
      const held = reserved.find((r) => r.stockItemId === i.stockItemId)?._sum.quantity ?? 0
      const left = i.stockItem.availableQty - held
      if (want > left) throw new AppError(left > 0 ? `Only ${left} ${i.name} left in stock.` : `${i.name} is out of stock right now.`, 409)
    }
    const total = items.reduce((s, i) => s + i.pointsCost * qty.get(i.id)!, 0)
    const [emp] = await tx.$queryRaw<{ id: string; name: string; empId: string; points: number; active: boolean }[]>`
      SELECT id, name, "empId", points, active FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`
    if (!emp) throw new AppError("Employee not found.", 404)
    if (!emp.active) throw new AppError("This employee record is inactive.", 403)
    if (emp.points < total)
      throw new AppError(`This order needs ${total.toLocaleString("en-IN")} points and you have ${emp.points.toLocaleString("en-IN")}. Remove something or earn ${(total - emp.points).toLocaleString("en-IN")} more.`, 409)
    const number = await nextOrderNumber(tx)
    const order = await tx.redemptionOrder.create({
      data: {
        number, employeeId: emp.id, totalPoints: total, placedById: user.id, note: note?.trim().slice(0, 300) || null,
        lines: { create: items.map((i) => ({ catalogItemId: i.id, stockItemId: i.stockItemId, name: i.name, pointsCost: i.pointsCost, quantity: qty.get(i.id)! })) },
      },
    })
    const pts = await applyPoints(tx, { employeeId: emp.id, delta: -total, type: "REDEMPTION", actorId: user.id, reason: `Store order ${number}` }, settings.rewards)
    await audit(tx, { actorId: user.id, action: "STORE_ORDER.PLACE", entity: "RedemptionOrder", entityId: order.id, summary: `${number}: ${emp.name} (${emp.empId}) spent ${total.toLocaleString("en-IN")} points on ${items.map((i) => `${i.name} x${qty.get(i.id)}`).join(", ")}; ${pts.after.toLocaleString("en-IN")} left` })
    return { id: order.id, number, total, balance: pts.after }
  })
}

async function lockOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "RedemptionOrder" WHERE id = ${id} FOR UPDATE`
  const o = await tx.redemptionOrder.findUnique({ where: { id }, include: { lines: { include: { stockItem: true } }, employee: true } })
  if (!o) throw new AppError("Order not found.", 404)
  return o
}

async function refund(tx: Tx, o: { id: string; number: string; employeeId: string; totalPoints: number }, actorId: string, why: string) {
  const settings = await getSettings()
  return applyPoints(tx, { employeeId: o.employeeId, delta: o.totalPoints, type: "REFUND", actorId, reason: `${o.number} ${why}` }, settings.rewards)
}

/** The employee cancels an order the team hasn't accepted yet. Points come back. */
export async function cancelOrder(id: string, employeeId: string, user: SessionUser) {
  return prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, id)
    if (o.employeeId !== employeeId) throw new AppError("You can only cancel your own orders.", 403)
    if (o.status !== "PLACED") throw new AppError("The team has already acted on this order, so it can't be cancelled here. Contact the engagement team.", 409)
    await tx.redemptionOrder.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() } })
    await refund(tx, o, user.id, "cancelled by the employee")
    await audit(tx, { actorId: user.id, action: "STORE_ORDER.CANCEL", entity: "RedemptionOrder", entityId: id, summary: `${o.number} cancelled by ${o.employee.name}; ${o.totalPoints} points refunded` })
  })
}

export type PickupInput = { location: string; pickupAt: string; note?: string }

function checkPickup(p: PickupInput) {
  const location = p.location?.trim()
  if (!location || location.length < 2 || location.length > 120) throw new AppError("Say where the employee should collect the goodies.")
  const at = new Date(p.pickupAt)
  if (Number.isNaN(at.getTime())) throw new AppError("Choose the pickup date and time.")
  if (at.getTime() < Date.now() - 3600_000) throw new AppError("The pickup time is in the past.")
  return { pickupLocation: location, pickupAt: at, pickupNote: p.note?.trim().slice(0, 300) || null }
}

/**
 * Accepts an order and gives the pickup slot. The goodies leave stock now (set aside for the employee).
 * Calling it again on an accepted order just changes the pickup details.
 */
export async function acceptOrder(id: string, pickup: PickupInput, user: SessionUser) {
  const p = checkPickup(pickup)
  return prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, id)
    if (o.status === "ACCEPTED") {
      await tx.redemptionOrder.update({ where: { id }, data: p })
      await audit(tx, { actorId: user.id, action: "STORE_ORDER.RESCHEDULE", entity: "RedemptionOrder", entityId: id, summary: `${o.number} pickup changed to ${p.pickupLocation}, ${p.pickupAt.toISOString()}` })
      return { number: o.number, rescheduled: true }
    }
    if (o.status !== "PLACED") throw new AppError("This order is no longer waiting for the team.", 409)
    const settings = await getSettings()
    for (const l of o.lines) {
      const rows = await tx.$queryRaw<{ availableQty: number }[]>`
        UPDATE "StockItem" SET "availableQty" = "availableQty" - ${l.quantity}, "distributedQty" = "distributedQty" + ${l.quantity}, "updatedAt" = now()
        WHERE id = ${l.stockItemId} AND (${!settings.preventNegativeStock} OR "availableQty" >= ${l.quantity})
        RETURNING "availableQty"`
      if (!rows.length) throw new AppError(`Not enough ${l.stockItem.name} in stock (${l.stockItem.availableQty} left). Receive stock first, or reject the order so the points go back.`, 409)
      await tx.ledgerEntry.create({
        data: { stockItemId: l.stockItemId, type: "REDEMPTION", qtyOut: l.quantity, balanceAfter: rows[0].availableQty, actorId: user.id, note: `Points store ${o.number} for ${o.employee.name} (${o.employee.empId})` },
      })
    }
    await tx.redemptionOrder.update({ where: { id }, data: { ...p, status: "ACCEPTED", decidedById: user.id, decidedAt: new Date() } })
    await audit(tx, { actorId: user.id, action: "STORE_ORDER.ACCEPT", entity: "RedemptionOrder", entityId: id, summary: `Accepted ${o.number} for ${o.employee.name}; pickup at ${p.pickupLocation}, ${p.pickupAt.toISOString()}` })
    return { number: o.number, rescheduled: false }
  })
}

/** Rejects an order (placed or accepted but not collected). Points are refunded; accepted goodies go back to stock. */
export async function rejectOrder(id: string, reason: string, user: SessionUser) {
  const why = reason?.trim()
  if (!why) throw new AppError("Give a reason. The employee sees it.")
  return prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, id)
    if (o.status !== "PLACED" && o.status !== "ACCEPTED") throw new AppError("This order is already closed.", 409)
    if (o.status === "ACCEPTED") {
      for (const l of o.lines) {
        const it = await tx.stockItem.update({ where: { id: l.stockItemId }, data: { availableQty: { increment: l.quantity }, distributedQty: { decrement: l.quantity } } })
        await tx.ledgerEntry.create({ data: { stockItemId: l.stockItemId, type: "REDEMPTION", qtyIn: l.quantity, balanceAfter: it.availableQty, actorId: user.id, note: `Points store ${o.number} not collected; back to stock` } })
      }
    }
    await tx.redemptionOrder.update({ where: { id }, data: { status: "REJECTED", rejectReason: why.slice(0, 300), decidedById: user.id, decidedAt: new Date() } })
    await refund(tx, o, user.id, `rejected: ${why}`.slice(0, 200))
    await audit(tx, { actorId: user.id, action: "STORE_ORDER.REJECT", entity: "RedemptionOrder", entityId: id, summary: `Rejected ${o.number} for ${o.employee.name}: ${why}; ${o.totalPoints} points refunded` })
  })
}

export async function markCollected(id: string, user: SessionUser) {
  return prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, id)
    if (o.status !== "ACCEPTED") throw new AppError(o.status === "PLACED" ? "Accept the order and give a pickup slot first." : "This order is already closed.", 409)
    await tx.redemptionOrder.update({ where: { id }, data: { status: "COLLECTED", collectedAt: new Date(), collectedById: user.id } })
    await audit(tx, { actorId: user.id, action: "STORE_ORDER.COLLECTED", entity: "RedemptionOrder", entityId: id, summary: `${o.number} collected by ${o.employee.name}` })
  })
}
