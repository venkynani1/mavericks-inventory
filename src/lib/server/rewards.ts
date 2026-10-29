import "server-only"
import type { PointsType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { applyWithinCap, crossedMilestones, pointsForEvent, type RewardRules } from "@/lib/points"
import { audit } from "./audit"
import { AppError, type SessionUser } from "./session"
import { getSettings } from "./settings"
import { nextRequestNumber, recomputeTotals } from "./workflow"

type Tx = Prisma.TransactionClient

/**
 * Changes an employee's points and writes the ledger, inside the caller's transaction.
 * The employee row is locked first, so two people recording attendance at the same moment
 * can't both read the same balance. Milestones crossed on the way up create rewards.
 */
export async function applyPoints(
  tx: Tx,
  input: { employeeId: string; delta: number; type: PointsType; actorId: string; reason?: string; eventId?: string },
  rules: RewardRules,
) {
  const [emp] = await tx.$queryRaw<{ id: string; points: number; cycle: number; lifetimePoints: number }[]>`
    SELECT id, points, cycle, "lifetimePoints" FROM "Employee" WHERE id = ${input.employeeId} FOR UPDATE`
  if (!emp) throw new AppError("Employee not found.", 404)
  const { next, applied } = applyWithinCap(emp.points, input.delta, rules.cap)
  await tx.employee.update({
    where: { id: emp.id },
    data: { points: next, lifetimePoints: applied > 0 ? { increment: applied } : undefined },
  })
  await tx.pointsTransaction.create({
    data: {
      employeeId: emp.id, type: input.type, points: applied, requested: input.delta, balanceAfter: next, cycle: emp.cycle,
      eventId: input.eventId ?? null, actorId: input.actorId,
      reason: applied !== input.delta ? `${input.reason ?? ""}${input.reason ? " " : ""}(limited by the ${rules.cap.toLocaleString("en-IN")}-point cap)`.trim() : (input.reason ?? null),
    },
  })
  const reached = crossedMilestones(emp.points, next, rules)
  if (reached.length) {
    const milestones = await tx.rewardMilestone.findMany({ where: { threshold: { in: reached } } })
    const title = (t: number) => milestones.find((m) => m.threshold === t)?.title ?? `${t.toLocaleString("en-IN")} points`
    await tx.rewardEarned.createMany({
      data: reached.map((t) => ({ employeeId: emp.id, threshold: t, cycle: emp.cycle, title: title(t) })),
      skipDuplicates: true,
    })
  }
  // A downward correction cancels rewards that are no longer earned and haven't been handed out yet.
  if (next < emp.points) {
    await tx.rewardEarned.updateMany({ where: { employeeId: emp.id, cycle: emp.cycle, status: "DUE", threshold: { gt: next } }, data: { status: "CANCELLED", note: "Points corrected below this milestone" } })
  }
  return { before: emp.points, after: next, applied, milestones: reached }
}

export async function nextEventCode(tx: Tx) {
  const year = new Date().getFullYear()
  const key = `event:${year}`
  const c = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } })
  return `EV-${year}-${String(c.value).padStart(4, "0")}`
}

/** Finds employees by employee ID, creating new ones when a name is supplied. */
export async function upsertEmployees(tx: Tx, people: { empId: string; name?: string; email?: string | null; department?: string | null; location?: string | null }[]) {
  const ids = [...new Set(people.map((p) => p.empId.trim()))]
  const existing = await tx.employee.findMany({ where: { empId: { in: ids } } })
  const byEmp = new Map(existing.map((e) => [e.empId, e]))
  const created: string[] = []
  for (const p of people) {
    const empId = p.empId.trim()
    if (byEmp.has(empId) || !p.name?.trim()) continue
    const email = p.email?.trim().toLowerCase() || null
    const clash = email ? await tx.employee.findUnique({ where: { email } }) : null
    const e = await tx.employee.create({ data: { empId, name: p.name.trim(), email: clash ? null : email, department: p.department || null, location: p.location || null } })
    byEmp.set(empId, e)
    created.push(empId)
  }
  return { byEmp, created }
}

/**
 * Records attendance and credits the event's points to each person, all in one transaction.
 * People already marked present are skipped, so uploading the same sheet twice is harmless.
 */
export async function recordAttendance(eventId: string, people: { empId: string; name?: string; email?: string | null; department?: string | null; location?: string | null }[], user: SessionUser) {
  const settings = await getSettings()
  return prisma.$transaction(
    async (tx) => {
      const event = await tx.event.findUnique({ where: { id: eventId }, include: { eventType: true } })
      if (!event) throw new AppError("Event not found.", 404)
      if (event.status === "CANCELLED") throw new AppError("This event is cancelled, so attendance can't be recorded.", 409)
      const pts = pointsForEvent(event, event.eventType)
      const { byEmp, created } = await upsertEmployees(tx, people)
      const unknown = people.filter((p) => !byEmp.has(p.empId.trim())).map((p) => p.empId)
      const already = new Set((await tx.attendance.findMany({ where: { eventId, employeeId: { in: [...byEmp.values()].map((e) => e.id) } }, select: { employeeId: true } })).map((a) => a.employeeId))
      let added = 0
      let capped = 0
      const milestones: { empId: string; name: string; thresholds: number[] }[] = []
      const seen = new Set<string>()
      for (const p of people) {
        const emp = byEmp.get(p.empId.trim())
        if (!emp || already.has(emp.id) || seen.has(emp.id)) continue
        seen.add(emp.id)
        if (!emp.active) continue
        await tx.attendance.create({ data: { eventId, employeeId: emp.id, pointsAwarded: pts, createdById: user.id } })
        const r = await applyPoints(tx, { employeeId: emp.id, delta: pts, type: "EVENT", actorId: user.id, eventId, reason: `${event.code} ${event.name}` }, settings.rewards)
        added++
        if (r.applied < pts) capped++
        if (r.milestones.length) milestones.push({ empId: emp.empId, name: emp.name, thresholds: r.milestones })
      }
      if (event.status === "PLANNED" && added) await tx.event.update({ where: { id: eventId }, data: { status: "COMPLETED" } })
      await audit(tx, { actorId: user.id, action: "EVENT.ATTENDANCE", entity: "Event", entityId: eventId, summary: `Marked ${added} attendee(s) at ${event.code} ${event.name} (+${pts} points each)${created.length ? `; ${created.length} new employee record(s)` : ""}` })
      return { added, alreadyPresent: already.size, unknown, created: created.length, capped, milestones, points: pts }
    },
    { timeout: 120_000, maxWait: 10_000 },
  )
}

/** Removes someone from an event and reverses exactly the points they were given for it. */
export async function removeAttendance(attendanceId: string, user: SessionUser, reason: string) {
  const settings = await getSettings()
  return prisma.$transaction(async (tx) => {
    const a = await tx.attendance.findUnique({ where: { id: attendanceId }, include: { event: true, employee: true } })
    if (!a) throw new AppError("Attendance record not found.", 404)
    await tx.attendance.delete({ where: { id: attendanceId } })
    const r = await applyPoints(tx, { employeeId: a.employeeId, delta: -a.pointsAwarded, type: "REVERSAL", actorId: user.id, eventId: a.eventId, reason: `Removed from ${a.event.code}: ${reason}` }, settings.rewards)
    await audit(tx, { actorId: user.id, action: "EVENT.ATTENDANCE_REMOVE", entity: "Event", entityId: a.eventId, summary: `Removed ${a.employee.name} (${a.employee.empId}) from ${a.event.code}; ${r.applied} points`, before: a })
  })
}

export async function adjustPoints(employeeId: string, delta: number, reason: string, user: SessionUser) {
  if (!Number.isInteger(delta) || delta === 0) throw new AppError("Enter a whole number of points, positive or negative.")
  if (!reason.trim()) throw new AppError("Give a reason for the adjustment. It's kept in the points history.")
  const settings = await getSettings()
  return prisma.$transaction(async (tx) => {
    const r = await applyPoints(tx, { employeeId, delta, type: "ADJUSTMENT", actorId: user.id, reason: reason.trim() }, settings.rewards)
    const emp = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } })
    await audit(tx, { actorId: user.id, action: "POINTS.ADJUST", entity: "Employee", entityId: employeeId, summary: `Adjusted ${emp.name} by ${delta > 0 ? "+" : ""}${delta} points (${r.before} → ${r.after}): ${reason.trim()}` })
    return r
  })
}

/** Starts a new cycle at zero. Rewards already earned stay as they are. */
export async function resetPoints(employeeId: string, reason: string, user: SessionUser) {
  if (!reason.trim()) throw new AppError("Give a reason for the reset. It's kept in the points history.")
  return prisma.$transaction(async (tx) => {
    const [emp] = await tx.$queryRaw<{ id: string; points: number; cycle: number; name: string }[]>`SELECT id, points, cycle, name FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`
    if (!emp) throw new AppError("Employee not found.", 404)
    await tx.employee.update({ where: { id: employeeId }, data: { points: 0, cycle: { increment: 1 } } })
    await tx.pointsTransaction.create({ data: { employeeId, type: "RESET", points: -emp.points, requested: -emp.points, balanceAfter: 0, cycle: emp.cycle + 1, actorId: user.id, reason: reason.trim() } })
    await audit(tx, { actorId: user.id, action: "POINTS.RESET", entity: "Employee", entityId: employeeId, summary: `Reset ${emp.name} from ${emp.points} to 0 points (cycle ${emp.cycle} → ${emp.cycle + 1}): ${reason.trim()}` })
  })
}

/**
 * Puts selected due rewards on one distribution request (a draft, or submitted straight away).
 * Stock leaves the shelf only when that request is approved; the rewards become "issued" then.
 */
export async function createRewardDistribution(
  input: { rewardIds: string[]; itemOverrides?: Record<string, string>; title?: string; submit?: boolean },
  user: SessionUser,
) {
  if (!input.rewardIds.length) throw new AppError("Select at least one reward.")
  return prisma.$transaction(async (tx) => {
    const rewards = await tx.rewardEarned.findMany({ where: { id: { in: input.rewardIds } }, include: { employee: true } })
    if (rewards.length !== input.rewardIds.length) throw new AppError("Some rewards no longer exist. Refresh and try again.")
    const notDue = rewards.filter((r) => r.status !== "DUE")
    if (notDue.length) throw new AppError(`${notDue.length} of the selected rewards are already being handed out or were issued.`, 409)
    const milestones = await tx.rewardMilestone.findMany({ where: { threshold: { in: [...new Set(rewards.map((r) => r.threshold))] } } })
    const lines = rewards.map((r) => {
      const m = milestones.find((x) => x.threshold === r.threshold)
      const stockItemId = input.itemOverrides?.[r.id] || m?.stockItemId
      if (!stockItemId) throw new AppError(`Choose a goodie for ${r.employee.name}'s ${r.threshold.toLocaleString("en-IN")} milestone (no goodie is set for that milestone yet).`)
      return { r, stockItemId, quantity: m?.quantity ?? 1 }
    })
    const items = await tx.stockItem.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.stockItemId))] }, status: "ACTIVE" }, select: { id: true } })
    if (items.length !== new Set(lines.map((l) => l.stockItemId)).size) throw new AppError("One of the goodies isn't an active stock item. Choose another.")
    const number = await nextRequestNumber(tx, "DISTRIBUTION")
    const req = await tx.request.create({
      data: { number, type: "DISTRIBUTION", title: input.title?.trim() || `Points rewards (${rewards.length})`, purpose: "Points reward", createdById: user.id },
    })
    const now = new Date()
    for (const l of lines) {
      await tx.distributionLine.create({
        data: {
          requestId: req.id, stockItemId: l.stockItemId, quantity: l.quantity, distributedOn: now, recipientId: l.r.employee.empId, recipientName: l.r.employee.name,
          location: l.r.employee.location, purpose: "Points reward", poc: user.name, remarks: `${l.r.threshold.toLocaleString("en-IN")}-point milestone (${l.r.title})`, rewardId: l.r.id,
        },
      })
    }
    await tx.rewardEarned.updateMany({ where: { id: { in: input.rewardIds } }, data: { status: "IN_PROGRESS", requestId: req.id } })
    await recomputeTotals(tx, req.id)
    await audit(tx, { actorId: user.id, action: "REWARD.DISTRIBUTION", entity: "Request", entityId: req.id, summary: `Created ${number} for ${rewards.length} points reward(s)` })
    return req
  })
}
