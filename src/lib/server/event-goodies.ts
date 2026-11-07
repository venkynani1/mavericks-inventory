import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { audit } from "./audit"
import { AppError, type SessionUser } from "./session"
import { nextRequestNumber, recomputeTotals, submitRequest } from "./workflow"

/*
 * Goodies for an event are asked for BEFORE the event: the executive lists the items and quantities,
 * the manager approves, and the stock leaves the shelf at approval. After the event, unused goodies
 * can be returned (a stock inward linked to the event) and goodie prizes for that event are taken
 * from what was approved, without a second approval.
 */

type Tx = Prisma.TransactionClient | typeof prisma

/** Today's date in India as YYYY-MM-DD. */
export function istToday(now = new Date()) {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)
}
export function istDay(d: Date) {
  return istToday(d)
}
/** True when the event's day (in India) is before today. The event day itself still counts as "before". */
export function eventPassed(date: Date, now = new Date()) {
  return istDay(date) < istToday(now)
}

export type AllocationRow = {
  stockItemId: string
  code: string
  name: string
  approved: number
  waiting: number
  returned: number
  prizes: number
  remaining: number
}

/** What was approved for an event, what's waiting, what came back, what went out as prizes and what's left. */
export async function eventAllocation(db: Tx, eventId: string): Promise<AllocationRow[]> {
  const [lines, receipts, prizes] = await Promise.all([
    db.distributionLine.findMany({
      where: { request: { eventId, type: "DISTRIBUTION", status: { in: ["APPROVED", "SUBMITTED"] } } },
      select: { stockItemId: true, quantity: true, request: { select: { status: true } }, stockItem: { select: { code: true, name: true } } },
    }),
    db.receiptLine.findMany({
      where: { request: { eventId, type: "RECEIPT", status: { in: ["APPROVED", "SUBMITTED"] } } },
      select: { stockItemId: true, quantity: true, stockItem: { select: { code: true, name: true } } },
    }),
    db.eventAward.findMany({
      where: { eventId, fromAllocation: true, status: "ISSUED" },
      select: { stockItemId: true, quantity: true, stockItem: { select: { code: true, name: true } } },
    }),
  ])
  const map = new Map<string, AllocationRow>()
  const row = (id: string, it: { code: string; name: string } | null) => {
    let r = map.get(id)
    if (!r) map.set(id, (r = { stockItemId: id, code: it?.code ?? "", name: it?.name ?? "", approved: 0, waiting: 0, returned: 0, prizes: 0, remaining: 0 }))
    return r
  }
  for (const l of lines) {
    const r = row(l.stockItemId, l.stockItem)
    if (l.request.status === "APPROVED") r.approved += l.quantity
    else r.waiting += l.quantity
  }
  // Returns count against what's left as soon as they're submitted, so the same goodies can't be returned twice.
  for (const l of receipts) row(l.stockItemId, l.stockItem).returned += l.quantity
  for (const p of prizes) if (p.stockItemId) row(p.stockItemId, p.stockItem).prizes += p.quantity
  for (const r of map.values()) r.remaining = Math.max(0, r.approved - r.returned - r.prizes)
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

type Line = { stockItemId: string; quantity: number }

function cleanLines(lines: Line[]) {
  if (!lines?.length) throw new AppError("Add at least one goodie.")
  const merged = new Map<string, number>()
  for (const [i, l] of lines.entries()) {
    const q = Math.trunc(Number(l.quantity))
    if (!l.stockItemId) throw new AppError(`Line ${i + 1}: choose a goodie.`)
    if (!(q >= 1 && q <= 100_000)) throw new AppError(`Line ${i + 1}: enter a quantity of at least 1.`)
    merged.set(l.stockItemId, (merged.get(l.stockItemId) ?? 0) + q)
  }
  return [...merged.entries()].map(([stockItemId, quantity]) => ({ stockItemId, quantity }))
}

/** Creates the goodies request for an upcoming event and (optionally) sends it for approval. */
export async function requestEventGoodies(eventId: string, input: { lines: Line[]; note?: string; submit: boolean }, user: SessionUser) {
  const lines = cleanLines(input.lines)
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { eventType: true } })
  if (!event) throw new AppError("Event not found.", 404)
  if (event.status === "CANCELLED") throw new AppError("This event is cancelled.", 409)
  if (eventPassed(event.date))
    throw new AppError("This event has already happened. Goodies need the manager's approval before the event; for goodies already handed out, record a normal distribution.", 409)
  const items = await prisma.stockItem.findMany({ where: { id: { in: lines.map((l) => l.stockItemId) }, status: "ACTIVE" }, select: { id: true } })
  if (items.length !== lines.length) throw new AppError("One of the chosen goodies isn't an active stock item any more. Refresh and choose again.")
  const req = await prisma.$transaction(async (tx) => {
    const number = await nextRequestNumber(tx, "DISTRIBUTION")
    const r = await tx.request.create({
      data: {
        number, type: "DISTRIBUTION", eventId, createdById: user.id,
        title: `Goodies for ${event.code} ${event.name}`.slice(0, 120),
        purpose: "Event goodies",
        remarks: input.note?.trim().slice(0, 500) || null,
      },
    })
    await tx.distributionLine.createMany({
      data: lines.map((l) => ({
        requestId: r.id, stockItemId: l.stockItemId, quantity: l.quantity, distributedOn: event.date,
        recipientName: event.name.slice(0, 120), location: event.location, purpose: `Event - ${event.eventType.name}`.slice(0, 80), poc: user.name,
        remarks: `Goodies for ${event.code}, approved before the event`,
      })),
    })
    await recomputeTotals(tx, r.id)
    await audit(tx, { actorId: user.id, action: "EVENT_GOODIES.CREATE", entity: "Event", entityId: eventId, summary: `Created ${number}: ${lines.reduce((s, l) => s + l.quantity, 0)} goodies for ${event.code} ${event.name}` })
    return r
  })
  if (input.submit) await submitRequest(req.id, user)
  return req
}

/** Sends unused goodies from an event back to stock (a stock inward linked to the event, approved like any other). */
export async function returnEventGoodies(eventId: string, input: { lines: Line[]; note?: string }, user: SessionUser) {
  const lines = cleanLines(input.lines)
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) throw new AppError("Event not found.", 404)
  const req = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`
    const alloc = await eventAllocation(tx, eventId)
    for (const l of lines) {
      const a = alloc.find((x) => x.stockItemId === l.stockItemId)
      if (!a || a.remaining < l.quantity) throw new AppError(`Only ${a?.remaining ?? 0} of ${a?.name ?? "that goodie"} are left from this event's approved goodies.`, 409)
    }
    const number = await nextRequestNumber(tx, "RECEIPT")
    const r = await tx.request.create({
      data: {
        number, type: "RECEIPT", eventId, createdById: user.id,
        title: `Unused goodies back from ${event.code} ${event.name}`.slice(0, 120),
        purpose: "Event return", remarks: input.note?.trim().slice(0, 500) || null,
      },
    })
    await tx.receiptLine.createMany({ data: lines.map((l) => ({ requestId: r.id, stockItemId: l.stockItemId, quantity: l.quantity, receivedOn: new Date(), remarks: `Unused after ${event.code}` })) })
    await recomputeTotals(tx, r.id)
    await audit(tx, { actorId: user.id, action: "EVENT_GOODIES.RETURN", entity: "Event", entityId: eventId, summary: `Created ${number}: ${lines.reduce((s, l) => s + l.quantity, 0)} unused goodies back from ${event.code}` })
    return r
  })
  await submitRequest(req.id, user)
  return req
}
