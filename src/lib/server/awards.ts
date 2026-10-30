import "server-only"
import { prisma } from "@/lib/db"
import { audit } from "./audit"
import { applyPoints, recordAttendance } from "./rewards"
import { AppError, type SessionUser } from "./session"
import { getSettings } from "./settings"
import { nextRequestNumber, recomputeTotals, submitRequest } from "./workflow"
import { BASE_AWARD_POSITIONS } from "../../../prisma/base-data"

/*
 * Event prizes: winners, runners-up, top performers. Each prize is a goodie from stock, a voucher
 * (Amazon or other) or something else (a trophy, a certificate). Optional bonus points are credited
 * when the prize is recorded.
 *   Goodies leave the shelf only through an approved distribution, like any other stock.
 *   Vouchers and other prizes are marked issued by an executive with a reference; both steps are audited.
 */

export type AwardInput = {
  empId: string
  position: string
  kind: "GOODIE" | "VOUCHER" | "OTHER"
  stockItemId?: string
  quantity?: number
  voucherProvider?: string
  voucherAmount?: number
  description?: string
  bonusPoints?: number
}

/** Positions for the picker. Created on first use if an older database has none. */
export async function awardPositions() {
  let rows = await prisma.awardPosition.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
  if (!rows.length) {
    await prisma.awardPosition.createMany({ data: BASE_AWARD_POSITIONS.map((p, sortOrder) => ({ ...p, sortOrder })), skipDuplicates: true })
    rows = await prisma.awardPosition.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
  }
  return rows
}

function check(input: AwardInput) {
  const empId = input.empId?.trim()
  if (!empId) throw new AppError("Enter the employee ID.")
  const position = input.position?.trim()
  if (!position || position.length > 60) throw new AppError("Choose the position (Winner, Runner-up…).")
  const bonus = Math.trunc(Number(input.bonusPoints ?? 0))
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > 5000) throw new AppError("Bonus points must be between 0 and 5,000.")
  if (input.kind === "GOODIE") {
    if (!input.stockItemId) throw new AppError("Choose the goodie.")
    const qty = Math.trunc(Number(input.quantity ?? 1))
    if (!(qty >= 1 && qty <= 100)) throw new AppError("Quantity must be between 1 and 100.")
    return { empId, position, bonus, qty }
  }
  if (input.kind === "VOUCHER") {
    const amt = Math.trunc(Number(input.voucherAmount))
    if (!(amt >= 1 && amt <= 1_000_000)) throw new AppError("Enter the voucher amount in rupees.")
    return { empId, position, bonus, qty: 1 }
  }
  if (input.kind === "OTHER") {
    if (!input.description?.trim()) throw new AppError("Say what the prize is (for example a trophy or certificate).")
    return { empId, position, bonus, qty: 1 }
  }
  throw new AppError("Choose the prize type.")
}

/** Records a prize. Someone not yet marked present is marked present first (they get the event's points too). */
export async function addAward(eventId: string, input: AwardInput, user: SessionUser) {
  const v = check(input)
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) throw new AppError("Event not found.", 404)
  if (event.status === "CANCELLED") throw new AppError("This event is cancelled.", 409)
  const emp = await prisma.employee.findUnique({ where: { empId: v.empId } })
  if (!emp) throw new AppError(`No employee with ID ${v.empId}. Add them under Employees first.`)
  if (!emp.active) throw new AppError(`${emp.name} is inactive.`)
  if (input.kind === "GOODIE") {
    const item = await prisma.stockItem.findUnique({ where: { id: input.stockItemId! } })
    if (!item || item.status !== "ACTIVE") throw new AppError("That goodie isn't an active stock item.")
  }
  let markedPresent = false
  if (!(await prisma.attendance.findUnique({ where: { eventId_employeeId: { eventId, employeeId: emp.id } } }))) {
    await recordAttendance(eventId, [{ empId: emp.empId }], user)
    markedPresent = true
  }
  const settings = await getSettings()
  const award = await prisma.$transaction(async (tx) => {
    const a = await tx.eventAward.create({
      data: {
        eventId, employeeId: emp.id, position: v.position, kind: input.kind, stockItemId: input.kind === "GOODIE" ? input.stockItemId : null, quantity: v.qty,
        voucherProvider: input.kind === "VOUCHER" ? input.voucherProvider?.trim() || "Amazon" : null, voucherAmount: input.kind === "VOUCHER" ? Math.trunc(Number(input.voucherAmount)) : null,
        description: input.description?.trim() || null, bonusPoints: v.bonus, createdById: user.id,
      },
      include: { stockItem: true },
    })
    let milestones: number[] = []
    if (v.bonus > 0) milestones = (await applyPoints(tx, { employeeId: emp.id, delta: v.bonus, type: "AWARD", actorId: user.id, eventId, reason: `${v.position} at ${event.code} ${event.name}` }, settings.rewards)).milestones
    await audit(tx, { actorId: user.id, action: "AWARD.CREATE", entity: "Event", entityId: eventId, summary: `${v.position}: ${emp.name} (${emp.empId}) at ${event.code}, prize ${prizeText(a)}${v.bonus ? `, +${v.bonus} bonus points` : ""}`, after: a })
    return { award: a, milestones }
  })
  return { ...award, markedPresent, name: emp.name }
}

export function prizeText(a: { kind: string; quantity: number; voucherProvider: string | null; voucherAmount: number | null; description: string | null; stockItem?: { name: string } | null }) {
  if (a.kind === "GOODIE") return `${a.stockItem?.name ?? "goodie"}${a.quantity > 1 ? ` x${a.quantity}` : ""}`
  if (a.kind === "VOUCHER") return `${a.voucherProvider ?? "Amazon"} voucher ₹${(a.voucherAmount ?? 0).toLocaleString("en-IN")}`
  return a.description ?? "Prize"
}

/** Cancels a prize not yet handed over, and takes back its bonus points. */
export async function cancelAward(id: string, reason: string, user: SessionUser) {
  if (!reason.trim()) throw new AppError("Give a reason. It's kept in the audit log.")
  const settings = await getSettings()
  return prisma.$transaction(async (tx) => {
    const a = await tx.eventAward.findUnique({ where: { id }, include: { event: true, employee: true, stockItem: true } })
    if (!a) throw new AppError("Prize not found.", 404)
    if (a.status !== "PENDING") throw new AppError(a.status === "IN_APPROVAL" ? "This prize is on a distribution waiting for approval. Remove it from that request first." : "This prize was already handed over or cancelled.", 409)
    await tx.eventAward.update({ where: { id }, data: { status: "CANCELLED", description: a.description ? `${a.description} (cancelled: ${reason.trim()})` : `Cancelled: ${reason.trim()}` } })
    if (a.bonusPoints > 0) await applyPoints(tx, { employeeId: a.employeeId, delta: -a.bonusPoints, type: "REVERSAL", actorId: user.id, eventId: a.eventId, reason: `${a.position} prize cancelled: ${reason.trim()}` }, settings.rewards)
    await audit(tx, { actorId: user.id, action: "AWARD.CANCEL", entity: "Event", entityId: a.eventId, summary: `Cancelled ${a.position} prize for ${a.employee.name} at ${a.event.code}: ${reason.trim()}`, before: a })
  })
}

/** Puts goodie prizes on one distribution request (draft or submitted). Stock moves when it's approved. */
export async function distributeAwards(ids: string[], opts: { submit: boolean; title?: string }, user: SessionUser) {
  if (!ids.length) throw new AppError("Select at least one prize.")
  const req = await prisma.$transaction(async (tx) => {
    const awards = await tx.eventAward.findMany({ where: { id: { in: ids } }, include: { employee: true, event: true } })
    if (awards.length !== ids.length) throw new AppError("Some prizes no longer exist. Refresh and try again.")
    const wrong = awards.filter((a) => a.kind !== "GOODIE" || a.status !== "PENDING" || !a.stockItemId)
    if (wrong.length) throw new AppError("Only goodie prizes that are still pending can go on a distribution.", 409)
    const number = await nextRequestNumber(tx, "DISTRIBUTION")
    const events = [...new Set(awards.map((a) => a.event.name))]
    const r = await tx.request.create({ data: { number, type: "DISTRIBUTION", title: opts.title?.trim() || `Event prizes: ${events.slice(0, 2).join(", ")}${events.length > 2 ? ` and ${events.length - 2} more` : ""}`, purpose: "Event prize", createdById: user.id } })
    for (const a of awards) {
      await tx.distributionLine.create({
        data: { requestId: r.id, stockItemId: a.stockItemId!, quantity: a.quantity, distributedOn: new Date(), recipientId: a.employee.empId, recipientName: a.employee.name, location: a.employee.location, purpose: "Event prize", poc: user.name, remarks: `${a.position}, ${a.event.code} ${a.event.name}`, awardId: a.id },
      })
    }
    await tx.eventAward.updateMany({ where: { id: { in: ids } }, data: { status: "IN_APPROVAL", requestId: r.id } })
    await recomputeTotals(tx, r.id)
    await audit(tx, { actorId: user.id, action: "AWARD.DISTRIBUTION", entity: "Request", entityId: r.id, summary: `Created ${number} for ${awards.length} event prize(s)` })
    return r
  })
  if (opts.submit) await submitRequest(req.id, user)
  return req
}

/** Marks vouchers and other prizes as handed over, with an order or reference number. */
export async function issueAwards(ids: string[], ref: string, user: SessionUser) {
  if (!ids.length) throw new AppError("Select at least one prize.")
  const reference = ref.trim()
  if (reference.length > 120) throw new AppError("Keep the reference under 120 characters.")
  return prisma.$transaction(async (tx) => {
    const awards = await tx.eventAward.findMany({ where: { id: { in: ids } }, include: { employee: true, event: true } })
    const wrong = awards.filter((a) => a.kind === "GOODIE" || a.status !== "PENDING")
    if (wrong.length || awards.length !== ids.length) throw new AppError("Only pending vouchers and other prizes can be marked issued here. Goodies go out through a distribution.", 409)
    if (awards.some((a) => a.kind === "VOUCHER") && !reference) throw new AppError("Enter the voucher order or reference number (not the voucher code itself).")
    await tx.eventAward.updateMany({ where: { id: { in: ids } }, data: { status: "ISSUED", issuedAt: new Date(), issuedById: user.id, voucherRef: reference || null } })
    await audit(tx, { actorId: user.id, action: "AWARD.ISSUE", entity: "EventAward", summary: `Marked ${awards.length} prize(s) issued${reference ? `, reference ${reference}` : ""}: ${awards.map((a) => `${a.employee.name} (${a.position}, ${a.event.code})`).join("; ")}`.slice(0, 1000) })
    return awards.length
  })
}

// ---------------- events from Excel ----------------

export const EVENT_ALIASES: Record<string, string[]> = {
  name: ["event name", "event", "title", "event title", "name of the event"],
  type: ["event type", "type", "category", "kind"],
  date: ["event date", "date", "on", "scheduled on", "start date"],
  location: ["venue", "place", "city", "mode"],
  organizer: ["organiser", "organised by", "organized by", "poc", "owner", "host"],
  points: ["points", "points per attendee"],
  description: ["description", "notes", "details", "remarks", "about"],
}
