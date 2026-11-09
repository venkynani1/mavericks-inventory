import "server-only"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/db"
import { audit } from "./audit"
import { eventAllocation } from "./event-goodies"
import { recordAttendance } from "./rewards"
import { AppError, type SessionUser } from "./session"
import { namesMatch } from "@/lib/names"

/*
 * Goodie collection at an event. The executive opens a "desk" for one goodie from the event's
 * approved goodies and shows its QR. An employee scans it and enters their name and employee ID.
 * The ID must be ACTIVE in the Fusion report, and each person can collect once per event. The claim
 * waits on the executive's screen until they hand the goodie over (or reject it). Handing over also
 * marks the person present at the event, so they get the event's points.
 */

export async function openDesk(eventId: string, stockItemId: string, qty: number, user: SessionUser) {
  const q = Math.trunc(Number(qty)) || 1
  if (q < 1 || q > 10) throw new AppError("Each person gets 1 to 10 of the goodie.")
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) throw new AppError("Event not found.", 404)
  if (event.status === "CANCELLED") throw new AppError("This event is cancelled.", 409)
  const alloc = (await eventAllocation(prisma, eventId)).find((a) => a.stockItemId === stockItemId)
  if (!alloc || alloc.approved <= 0) throw new AppError("Choose a goodie that was approved for this event. Request goodies first and get them approved.", 409)
  if (alloc.remaining < q) throw new AppError(`Only ${alloc.remaining} ${alloc.name} left from this event's approved goodies.`, 409)
  const token = event.claimToken ?? randomBytes(12).toString("base64url")
  await prisma.event.update({ where: { id: eventId }, data: { claimToken: token, claimOpen: true, claimStockItemId: stockItemId, claimQty: q } })
  await audit(prisma, { actorId: user.id, action: "CLAIM_DESK.OPEN", entity: "Event", entityId: eventId, summary: `Opened the goodies desk for ${event.code}: ${alloc.name} x${q} per person` })
  return token
}

export async function closeDesk(eventId: string, user: SessionUser) {
  const e = await prisma.event.update({ where: { id: eventId }, data: { claimOpen: false } })
  await audit(prisma, { actorId: user.id, action: "CLAIM_DESK.CLOSE", entity: "Event", entityId: eventId, summary: `Closed the goodies desk for ${e.code}` })
}

/** Public: an employee who scanned the QR claims their goodie. */
export async function submitClaim(token: string, input: { empId: string; name: string }) {
  const empId = String(input.empId ?? "").trim().replace(/\s+/g, "")
  const name = String(input.name ?? "").trim().slice(0, 120)
  if (!/^\d{4,15}$/.test(empId)) throw new AppError("Enter your employee ID (numbers only).")
  if (name.length < 2) throw new AppError("Enter your name.")
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { claimToken: token } })
    if (!event || !event.claimOpen || !event.claimStockItemId) throw new AppError("This goodies desk is closed. Ask the team at the desk.", 409)
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`
    const emp = await tx.employee.findUnique({ where: { empId } })
    if (!emp) throw new AppError(`We couldn't find employee ID ${empId}. Check the number, or ask the team at the desk.`, 404)
    if (!emp.active) throw new AppError("Only active employees can collect goodies. Ask the team at the desk if this is wrong.", 403)
    const prev = await tx.eventClaim.findUnique({ where: { eventId_employeeId: { eventId: event.id, employeeId: emp.id } } })
    if (prev && prev.status !== "REJECTED") throw new AppError(prev.status === "HANDED" ? "You've already collected your goodie at this event." : "You've already claimed. Show this screen at the desk.", 409, )
    const left = (await eventAllocation(tx, event.id)).find((a) => a.stockItemId === event.claimStockItemId)
    if (!left || left.remaining < event.claimQty) throw new AppError("Sorry, all the goodies at this desk have been given out.", 409)
    const data = { empIdEntered: empId, nameEntered: name, nameMatches: namesMatch(name, emp.name), stockItemId: event.claimStockItemId, quantity: event.claimQty, status: "PENDING" as const, decidedAt: null, decidedById: null, rejectReason: null, createdAt: new Date() }
    const claim = prev ? await tx.eventClaim.update({ where: { id: prev.id }, data }) : await tx.eventClaim.create({ data: { ...data, eventId: event.id, employeeId: emp.id } })
    return { id: claim.id }
  })
}

export async function handOverClaim(claimId: string, user: SessionUser) {
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventClaim" WHERE id = ${claimId} FOR UPDATE`
    const c = await tx.eventClaim.findUnique({ where: { id: claimId }, include: { employee: true, event: true, stockItem: true } })
    if (!c) throw new AppError("Claim not found.", 404)
    if (c.status !== "PENDING") throw new AppError("This claim has already been dealt with.", 409)
    await tx.eventClaim.update({ where: { id: claimId }, data: { status: "HANDED", decidedAt: new Date(), decidedById: user.id } })
    await audit(tx, { actorId: user.id, action: "CLAIM.HANDED", entity: "EventClaim", entityId: claimId, summary: `Handed ${c.stockItem.name} x${c.quantity} to ${c.employee.name} (${c.employee.empId}) at ${c.event.code}${c.nameMatches ? "" : `; name entered: ${c.nameEntered}`}` })
    return c
  })
  // They were at the event: make sure they're marked present (credits the event's points once).
  const att = await recordAttendance(claim.eventId, [{ empId: claim.employee.empId }], user)
  return { name: claim.employee.name, markedPresent: att.added > 0 }
}

export async function rejectClaim(claimId: string, reason: string, user: SessionUser) {
  const why = reason?.trim() || "Not handed over"
  const c = await prisma.eventClaim.findUnique({ where: { id: claimId }, include: { employee: true, event: true } })
  if (!c) throw new AppError("Claim not found.", 404)
  if (c.status !== "PENDING") throw new AppError("This claim has already been dealt with.", 409)
  await prisma.eventClaim.update({ where: { id: claimId }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: user.id, rejectReason: why.slice(0, 200) } })
  await audit(prisma, { actorId: user.id, action: "CLAIM.REJECTED", entity: "EventClaim", entityId: claimId, summary: `Rejected the claim by ${c.nameEntered} (${c.empIdEntered}) at ${c.event.code}: ${why}` })
}
