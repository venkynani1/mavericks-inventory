"use server"

import { revalidatePath } from "next/cache"
import { forget } from "@/lib/server/memo"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { run } from "@/lib/server/action"
import { audit } from "@/lib/server/audit"
import { presentFields, readSheet, toDate, toInt, toNum, toStr } from "@/lib/server/excel"
import { addAward, awardPositions, cancelAward, distributeAwards, EVENT_ALIASES, issueAwards, type AwardInput } from "@/lib/server/awards"
import { adjustPoints, createRewardDistribution, nextEventCode, recordAttendance, removeAttendance, resetPoints } from "@/lib/server/rewards"
import { AppError, assertPermission } from "@/lib/server/session"
import { SETTINGS_TAG } from "@/lib/server/settings"
import { submitRequest } from "@/lib/server/workflow"

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input)
  if (!r.success) throw new AppError(r.error.issues[0].message)
  return r.data
}

const refresh = (...paths: string[]) => {
  for (const p of ["/events", "/employees", "/rewards", "/leaderboard", "/", ...paths]) revalidatePath(p)
}

// ---------------- events ----------------

const eventSchema = z.object({
  name: z.string().trim().min(3, "Enter the event name").max(140),
  eventTypeId: z.string().min(1, "Choose the event type"),
  date: z.string().min(8, "Choose the date"),
  location: z.string().trim().max(80).optional(),
  organizer: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  points: z.union([z.literal(""), z.coerce.number().int().min(0, "Points can't be negative").max(5000, "That's more than 5,000 points")]).optional(),
})
export type EventInput = z.input<typeof eventSchema>

const eventData = (v: z.output<typeof eventSchema>) => ({
  name: v.name,
  eventTypeId: v.eventTypeId,
  date: new Date(`${v.date.slice(0, 10)}T10:00:00+05:30`),
  location: v.location || null,
  organizer: v.organizer || null,
  description: v.description || null,
  points: v.points === "" || v.points === undefined ? null : v.points,
})

export async function createEvent(input: EventInput) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const v = parse(eventSchema, input)
    const ev = await prisma.$transaction(async (tx) => {
      const ev = await tx.event.create({ data: { ...eventData(v), code: await nextEventCode(tx), createdById: user.id } })
      await audit(tx, { actorId: user.id, action: "EVENT.CREATE", entity: "Event", entityId: ev.id, summary: `Created ${ev.code} ${ev.name}`, after: ev })
      return ev
    })
    refresh()
    return { id: ev.id }
  }, "Event created. Add attendees when it's done.")
}

export async function updateEvent(id: string, input: EventInput) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const v = parse(eventSchema, input)
    await prisma.$transaction(async (tx) => {
      const before = await tx.event.findUnique({ where: { id }, include: { _count: { select: { attendance: true } } } })
      if (!before) throw new AppError("Event not found.", 404)
      const data = eventData(v)
      // Points already credited stay as they were; changing them now would silently rewrite history.
      if (before._count.attendance && (data.points !== before.points || data.eventTypeId !== before.eventTypeId))
        throw new AppError("Attendance is already recorded, so the event type and points can't change. Remove the attendees first, or adjust points per person.")
      const after = await tx.event.update({ where: { id }, data })
      await audit(tx, { actorId: user.id, action: "EVENT.UPDATE", entity: "Event", entityId: id, summary: `Updated ${after.code} ${after.name}`, before, after })
    })
    refresh(`/events/${id}`)
  }, "Event saved.")
}

export async function setEventStatus(id: string, status: "PLANNED" | "COMPLETED" | "CANCELLED") {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const ev = await prisma.event.findUnique({ where: { id }, include: { _count: { select: { attendance: true } } } })
    if (!ev) throw new AppError("Event not found.", 404)
    if (status === "CANCELLED" && ev._count.attendance) throw new AppError("People are marked present at this event. Remove them first, so their points are reversed.")
    await prisma.event.update({ where: { id }, data: { status } })
    await audit(prisma, { actorId: user.id, action: "EVENT.STATUS", entity: "Event", entityId: id, summary: `${ev.code} marked ${status.toLowerCase()}` })
    refresh(`/events/${id}`)
  }, status === "CANCELLED" ? "Event cancelled." : "Event updated.")
}

/** Accepts employee IDs separated by commas, spaces or new lines (pasted from Excel or Teams). */
export async function addAttendees(eventId: string, pasted: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const ids = [...new Set(pasted.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]
    if (!ids.length) throw new AppError("Enter at least one employee ID.")
    if (ids.length > 5000) throw new AppError("Add up to 5,000 people at a time, or upload a sheet.")
    const r = await recordAttendance(eventId, ids.map((empId) => ({ empId })), user)
    refresh(`/events/${eventId}`)
    return r
  })
}

const ATT_ALIASES = {
  empId: ["employee id", "emp id", "empid", "emp no", "employee number", "employee code", "id"],
  name: ["employee name", "emp name", "full name", "name of the employee"],
  email: ["email id", "mail", "email address", "official email"],
  department: ["dept", "practice", "bu", "business unit"],
  location: ["base location", "office", "city"],
}

export async function uploadAttendance(eventId: string, form: FormData) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const file = form.get("file")
    if (!(file instanceof File) || !file.size) throw new AppError("Choose an Excel file (.xlsx).")
    if (file.size > 10 * 1024 * 1024) throw new AppError("That file is larger than 10 MB.")
    if (!/\.xlsx$/i.test(file.name)) throw new AppError("Save the sheet as .xlsx and upload it again.")
    const sheet = await readSheet(await file.arrayBuffer(), ATT_ALIASES, [/attend/i])
    if (!presentFields(sheet, ATT_ALIASES).has("empId")) throw new AppError("The sheet needs an \"Employee ID\" column.")
    const people = sheet.rows
      .map((r) => ({ empId: toStr(r.values.empId) ?? "", name: toStr(r.values.name) ?? undefined, email: toStr(r.values.email), department: toStr(r.values.department), location: toStr(r.values.location) }))
      .map((p) => ({ ...p, empId: p.empId.replace(/\.0$/, "") }))
      .filter((p) => p.empId)
    if (!people.length) throw new AppError("No employee IDs were found in the sheet.")
    const r = await recordAttendance(eventId, people, user)
    refresh(`/events/${eventId}`)
    return { ...r, rows: people.length }
  })
}

export async function removeAttendee(attendanceId: string, reason: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    if (!reason.trim()) throw new AppError("Give a reason. It's kept in the person's points history.")
    await removeAttendance(attendanceId, user, reason.trim())
    refresh()
  }, "Removed, and their points for this event were reversed.")
}

// ---------------- employees and points ----------------

const empSchema = z.object({
  empId: z.string().trim().min(3, "Enter the employee ID").max(20).regex(/^[A-Za-z0-9-]+$/, "Employee ID: letters and numbers only"),
  name: z.string().trim().min(2, "Enter the name").max(100),
  email: z.union([z.string().trim().toLowerCase().email("Enter a valid email"), z.literal("")]).optional(),
  department: z.string().trim().max(80).optional(),
  designation: z.string().trim().max(80).optional(),
  location: z.string().trim().max(60).optional(),
  active: z.boolean().optional(),
})
export type EmployeeInput = z.input<typeof empSchema>

export async function saveEmployee(id: string | null, input: EmployeeInput) {
  return run(async () => {
    const user = await assertPermission("rewards:operate").catch(() => assertPermission("rewards:configure"))
    const v = parse(empSchema, input)
    const data = { empId: v.empId, name: v.name, email: v.email || null, department: v.department || null, designation: v.designation || null, location: v.location || null, ...(v.active === undefined ? {} : { active: v.active }) }
    const emp = id ? await prisma.employee.update({ where: { id }, data }) : await prisma.employee.create({ data })
    await audit(prisma, { actorId: user.id, action: id ? "EMPLOYEE.UPDATE" : "EMPLOYEE.CREATE", entity: "Employee", entityId: emp.id, summary: `${id ? "Updated" : "Added"} employee ${emp.name} (${emp.empId})` })
    refresh(`/employees/${emp.id}`)
    return { id: emp.id }
  }, id ? "Employee saved." : "Employee added.")
}

export async function adjustEmployeePoints(employeeId: string, delta: number, reason: string) {
  return run(async () => {
    const user = await assertPermission("rewards:configure")
    const r = await adjustPoints(employeeId, Math.trunc(Number(delta)), reason, user)
    refresh(`/employees/${employeeId}`)
    return r
  })
}

export async function resetEmployeePoints(employeeId: string, reason: string) {
  return run(async () => {
    const user = await assertPermission("rewards:configure")
    await resetPoints(employeeId, reason, user)
    refresh(`/employees/${employeeId}`)
  }, "Points reset to zero. A new cycle has started; earlier rewards are kept.")
}

/** Resets everyone (for example at the start of a new year). Requires typing RESET to confirm. */
export async function resetAllPoints(reason: string, confirm: string) {
  return run(async () => {
    const user = await assertPermission("rewards:configure")
    if (confirm !== "RESET") throw new AppError("Type RESET to confirm.")
    if (!reason.trim()) throw new AppError("Give a reason for the reset.")
    const emps = await prisma.employee.findMany({ where: { points: { gt: 0 } }, select: { id: true } })
    for (const e of emps) await resetPoints(e.id, reason, user)
    await audit(prisma, { actorId: user.id, action: "POINTS.RESET_ALL", entity: "Employee", summary: `Reset points for ${emps.length} employees: ${reason.trim()}` })
    refresh()
    return { count: emps.length }
  })
}

// ---------------- rewards fulfilment ----------------

export async function distributeRewards(rewardIds: string[], opts: { submit: boolean; title?: string; itemOverrides?: Record<string, string> }) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const req = await createRewardDistribution({ rewardIds, title: opts.title, itemOverrides: opts.itemOverrides }, user)
    if (opts.submit) await submitRequest(req.id, user)
    refresh("/requests", "/approvals", "/distributions")
    return { id: req.id, number: req.number }
  })
}

// ---------------- admin: rules ----------------

const typeSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(60),
  category: z.enum(["TECH", "NON_TECH", "WORKSHOP", "HACKATHON", "CODEATHON", "OTHER"]),
  points: z.coerce.number().int("Whole points only").min(0, "Points can't be negative").max(5000, "Keep it under 5,000"),
  description: z.string().trim().max(300).optional(),
  active: z.boolean(),
})
export type EventTypeInput = z.input<typeof typeSchema>

export async function saveEventType(id: string | null, input: EventTypeInput) {
  return run(async () => {
    const admin = await assertPermission("rewards:configure")
    const v = parse(typeSchema, input)
    const before = id ? await prisma.eventType.findUnique({ where: { id } }) : null
    const t = id ? await prisma.eventType.update({ where: { id }, data: v }) : await prisma.eventType.create({ data: { ...v, sortOrder: 100 } })
    await audit(prisma, { actorId: admin.id, action: id ? "EVENT_TYPE.UPDATE" : "EVENT_TYPE.CREATE", entity: "EventType", entityId: t.id, summary: `${t.name}: ${t.points} points${before && before.points !== t.points ? ` (was ${before.points})` : ""}`, before, after: t })
    revalidatePath("/admin/rewards")
  }, "Saved. New attendance uses these points; points already credited don't change.")
}

const rulesSchema = z.object({
  step: z.coerce.number().int().min(100, "A milestone every 100 points at least").max(100_000),
  cap: z.coerce.number().int().min(100).max(1_000_000),
  leaderboardForEmployees: z.boolean(),
})

export async function saveRewardRules(input: z.input<typeof rulesSchema>) {
  return run(async () => {
    const admin = await assertPermission("rewards:configure")
    const v = parse(rulesSchema, input)
    if (v.cap < v.step) throw new AppError("The maximum must be at least one milestone step.")
    if (v.cap % v.step !== 0) throw new AppError(`The maximum should be a multiple of the step (for example ${v.step * Math.max(1, Math.round(v.cap / v.step))}).`)
    if (v.cap / v.step > 50) throw new AppError("That gives more than 50 milestones. Use a bigger step.")
    await prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries({ rewardStep: v.step, rewardCap: v.cap, leaderboardForEmployees: v.leaderboardForEmployees }))
        await tx.setting.upsert({ where: { key }, create: { key, value: String(value), updatedBy: admin.id }, update: { value: String(value), updatedBy: admin.id } })
      const wanted: number[] = []
      for (let t = v.step; t <= v.cap; t += v.step) wanted.push(t)
      await tx.rewardMilestone.updateMany({ where: { threshold: { notIn: wanted } }, data: { active: false } })
      await tx.rewardMilestone.updateMany({ where: { threshold: { in: wanted } }, data: { active: true } })
      const have = new Set((await tx.rewardMilestone.findMany({ select: { threshold: true } })).map((m) => m.threshold))
      await tx.rewardMilestone.createMany({ data: wanted.filter((t) => !have.has(t)).map((t) => ({ threshold: t, title: `${t.toLocaleString("en-IN")} points` })) })
      await audit(tx, { actorId: admin.id, action: "REWARD_RULES.UPDATE", entity: "Setting", summary: `Milestone every ${v.step} points up to ${v.cap}; leaderboard for employees ${v.leaderboardForEmployees ? "on" : "off"}`, after: v })
    })
    forget(SETTINGS_TAG)
    revalidatePath("/admin/rewards")
  }, "Reward rules saved.")
}

const milestoneSchema = z.object({
  title: z.string().trim().min(2, "Enter a title").max(60),
  description: z.string().trim().max(300).optional(),
  stockItemId: z.string().optional(),
  quantity: z.coerce.number().int().min(1).max(20),
})

export async function saveMilestone(id: string, input: z.input<typeof milestoneSchema>) {
  return run(async () => {
    const admin = await assertPermission("rewards:configure")
    const v = parse(milestoneSchema, input)
    const before = await prisma.rewardMilestone.findUnique({ where: { id }, include: { stockItem: true } })
    if (!before) throw new AppError("Milestone not found.", 404)
    const after = await prisma.rewardMilestone.update({ where: { id }, data: { title: v.title, description: v.description || null, stockItemId: v.stockItemId || null, quantity: v.quantity }, include: { stockItem: true } })
    await audit(prisma, { actorId: admin.id, action: "MILESTONE.UPDATE", entity: "RewardMilestone", entityId: id, summary: `${after.threshold} milestone: ${after.title}, goodie ${after.stockItem?.name ?? "to be decided"}${before.stockItemId !== after.stockItemId ? ` (was ${before.stockItem?.name ?? "to be decided"})` : ""}`, before, after })
    revalidatePath("/admin/rewards")
    revalidatePath("/rewards")
  }, "Milestone saved. Rewards not yet handed out will use this goodie.")
}

// ---------------- event prizes (winners, runners-up…) ----------------

export async function addEventAward(eventId: string, input: AwardInput) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const r = await addAward(eventId, input, user)
    refresh(`/events/${eventId}`, "/prizes")
    return { name: r.name, markedPresent: r.markedPresent, milestones: r.milestones }
  })
}

export async function cancelEventAward(id: string, reason: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    await cancelAward(id, reason, user)
    refresh("/prizes")
  }, "Prize cancelled. Any bonus points were taken back.")
}

export async function distributeEventAwards(ids: string[], submit: boolean) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const req = await distributeAwards(ids, { submit }, user)
    refresh("/prizes", "/requests", "/approvals", "/distributions")
    return { id: req.id, number: req.number }
  })
}

export async function issueEventAwards(ids: string[], reference: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const n = await issueAwards(ids, reference, user)
    refresh("/prizes")
    return { count: n }
  })
}

const positionSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(60),
  bonusPoints: z.coerce.number().int("Whole points only").min(0, "Can't be negative").max(5000, "Keep it under 5,000"),
  active: z.boolean(),
})

export async function saveAwardPosition(id: string | null, input: z.input<typeof positionSchema>) {
  return run(async () => {
    const admin = await assertPermission("rewards:configure")
    const v = parse(positionSchema, input)
    const p = id ? await prisma.awardPosition.update({ where: { id }, data: v }) : await prisma.awardPosition.create({ data: { ...v, sortOrder: 100 } })
    await audit(prisma, { actorId: admin.id, action: id ? "AWARD_POSITION.UPDATE" : "AWARD_POSITION.CREATE", entity: "AwardPosition", entityId: p.id, summary: `${p.name}: ${p.bonusPoints} bonus points${p.active ? "" : " (retired)"}` })
    revalidatePath("/admin/rewards")
  }, "Saved. New prizes use these bonus points.")
}

// ---------------- events from Excel ----------------

export type EventUploadResult = { created: number; duplicates: number; rows: number; errors: { row: number; message: string }[]; upcoming: number }

export async function uploadEvents(form: FormData) {
  return run(async (): Promise<EventUploadResult> => {
    const user = await assertPermission("rewards:operate")
    const file = form.get("file")
    if (!(file instanceof File) || !file.size) throw new AppError("Choose an Excel file (.xlsx).")
    if (file.size > 10 * 1024 * 1024) throw new AppError("That file is larger than 10 MB.")
    if (!/\.xlsx$/i.test(file.name)) throw new AppError("Save the sheet as .xlsx and upload it again.")
    const sheet = await readSheet(await file.arrayBuffer(), EVENT_ALIASES, [/event/i])
    const present = presentFields(sheet, EVENT_ALIASES)
    for (const need of ["name", "type", "date"]) if (!present.has(need)) throw new AppError(`The sheet needs columns for Event name, Event type and Date. "${{ name: "Event name", type: "Event type", date: "Date" }[need]}" is missing.`)
    if (sheet.rows.length > 2000) throw new AppError("Upload up to 2,000 events at a time.")
    const types = await prisma.eventType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })
    const CATEGORY: Record<string, string> = { tech: "TECH", technical: "TECH", "non-tech": "NON_TECH", "non tech": "NON_TECH", nontech: "NON_TECH", workshop: "WORKSHOP", hackathon: "HACKATHON", codeathon: "CODEATHON", "code-a-thon": "CODEATHON", other: "OTHER" }
    const findType = (raw: string) => {
      const t = raw.trim().toLowerCase()
      return types.find((x) => x.name.toLowerCase() === t) ?? types.find((x) => x.category === CATEGORY[t]) ?? types.find((x) => t.includes(x.name.toLowerCase()))
    }
    const errors: EventUploadResult["errors"] = []
    const good: { name: string; eventTypeId: string; date: Date; location: string | null; organizer: string | null; points: number | null; description: string | null }[] = []
    for (const r of sheet.rows) {
      const name = toStr(r.values.name)
      const typeRaw = toStr(r.values.type)
      const d = toDate(r.values.date)
      const pts = r.values.points === null || r.values.points === undefined ? null : toInt(r.values.points)
      if (!name || name.length < 3) { errors.push({ row: r.rowNumber, message: "Event name is missing" }); continue }
      const type = typeRaw ? findType(typeRaw) : undefined
      if (!type) { errors.push({ row: r.rowNumber, message: `Event type "${typeRaw ?? ""}" isn't one of: ${types.map((t) => t.name).join(", ")}` }); continue }
      if (!d || d === "invalid") { errors.push({ row: r.rowNumber, message: "Date is missing or not a date (use dd-mm-yyyy)" }); continue }
      if (pts !== null && (Number.isNaN(pts) || pts < 0 || pts > 5000)) { errors.push({ row: r.rowNumber, message: "Points must be a whole number from 0 to 5,000" }); continue }
      const date = new Date(`${d.toISOString().slice(0, 10)}T10:00:00+05:30`)
      good.push({ name: name.slice(0, 140), eventTypeId: type.id, date, location: toStr(r.values.location)?.slice(0, 80) ?? null, organizer: toStr(r.values.organizer)?.slice(0, 80) ?? null, points: pts, description: toStr(r.values.description)?.slice(0, 1000) ?? null })
    }
    let created = 0
    let duplicates = 0
    let upcoming = 0
    const today = new Date(Date.now() - 86400_000)
    await prisma.$transaction(
      async (tx) => {
        for (const e of good) {
          const dayStart = new Date(e.date.getTime() - 12 * 3600_000)
          const dayEnd = new Date(e.date.getTime() + 12 * 3600_000)
          const exists = await tx.event.findFirst({ where: { name: { equals: e.name, mode: "insensitive" }, date: { gte: dayStart, lte: dayEnd } }, select: { id: true } })
          if (exists) { duplicates++; continue }
          await tx.event.create({ data: { ...e, code: await nextEventCode(tx), status: "PLANNED", createdById: user.id } })
          created++
          if (e.date >= today) upcoming++
        }
        await audit(tx, { actorId: user.id, action: "EVENT.UPLOAD", entity: "Event", summary: `Uploaded ${file.name}: ${created} event(s) created, ${duplicates} already there, ${errors.length} row(s) with problems` })
      },
      { timeout: 120_000, maxWait: 10_000 },
    )
    refresh()
    return { created, duplicates, rows: sheet.rows.length, errors, upcoming }
  })
}

// ---------------- bulk uploads: employees, winners ----------------

export type SheetResult = { rows: number; lines: string[]; errors: { row: number; message: string }[] }

async function readUpload(form: FormData, aliases: Record<string, string[]>, prefer: RegExp[]) {
  const file = form.get("file")
  if (!(file instanceof File) || !file.size) throw new AppError("Choose an Excel file (.xlsx).")
  if (file.size > 10 * 1024 * 1024) throw new AppError("That file is larger than 10 MB.")
  if (!/\.xlsx$/i.test(file.name)) throw new AppError("Save the sheet as .xlsx and upload it again.")
  const sheet = await readSheet(await file.arrayBuffer(), aliases, prefer)
  return { sheet, present: presentFields(sheet, aliases), fileName: file.name }
}

const EMP_ALIASES: Record<string, string[]> = {
  empId: ["employee id", "emp id", "empid", "emp no", "employee number", "employee code", "id"],
  name: ["employee name", "emp name", "full name", "name of the employee"],
  email: ["email id", "mail", "email address", "official email", "work email"],
  department: ["dept", "practice", "bu", "business unit"],
  designation: ["role", "title", "job title", "grade"],
  location: ["base location", "office", "city"],
  active: ["status", "is active"],
}

/** Adds new employees and updates existing ones (matched by employee ID). Points are never touched. */
export async function uploadEmployees(form: FormData) {
  return run(async (): Promise<SheetResult> => {
    const user = await assertPermission("rewards:operate").catch(() => assertPermission("rewards:configure"))
    const { sheet, present, fileName } = await readUpload(form, EMP_ALIASES, [/emp/i, /people/i])
    if (!present.has("empId") || !present.has("name")) throw new AppError('The sheet needs "Employee ID" and "Employee Name" columns.')
    if (sheet.rows.length > 20_000) throw new AppError("Upload up to 20,000 employees at a time.")
    const errors: SheetResult["errors"] = []
    const seen = new Set<string>()
    const good: { row: number; empId: string; name: string; email: string | null; department: string | null; designation: string | null; location: string | null; active?: boolean }[] = []
    for (const r of sheet.rows) {
      const empId = (toStr(r.values.empId) ?? "").replace(/\.0$/, "")
      const name = toStr(r.values.name)
      const email = toStr(r.values.email)?.toLowerCase() ?? null
      if (!empId || !/^[A-Za-z0-9-]{3,20}$/.test(empId)) { errors.push({ row: r.rowNumber, message: `Employee ID "${empId}" isn't valid (3 to 20 letters or digits)` }); continue }
      if (!name || name.length < 2) { errors.push({ row: r.rowNumber, message: "Name is missing" }); continue }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ row: r.rowNumber, message: `Email "${email}" isn't valid` }); continue }
      if (seen.has(empId)) { errors.push({ row: r.rowNumber, message: `Employee ID ${empId} appears twice in the sheet` }); continue }
      seen.add(empId)
      const act = toStr(r.values.active)?.toLowerCase()
      good.push({ row: r.rowNumber, empId, name: name.slice(0, 100), email, department: toStr(r.values.department)?.slice(0, 80) ?? null, designation: toStr(r.values.designation)?.slice(0, 80) ?? null, location: toStr(r.values.location)?.slice(0, 60) ?? null, active: act ? !/^(no|n|false|inactive|left|0)$/.test(act) : undefined })
    }
    let created = 0
    let updated = 0
    let unchanged = 0
    const existing = new Map((await prisma.employee.findMany({ where: { empId: { in: good.map((g) => g.empId) } } })).map((e) => [e.empId, e]))
    for (const g of good) {
      const e = existing.get(g.empId)
      // An email already used by someone else is left out rather than failing the row.
      const emailOwner = g.email ? await prisma.employee.findUnique({ where: { email: g.email }, select: { empId: true } }) : null
      const email = emailOwner && emailOwner.empId !== g.empId ? undefined : g.email
      if (emailOwner && emailOwner.empId !== g.empId) errors.push({ row: g.row, message: `Email ${g.email} already belongs to ${emailOwner.empId}; saved without it` })
      if (!e) {
        await prisma.employee.create({ data: { empId: g.empId, name: g.name, email: email ?? null, department: g.department, designation: g.designation, location: g.location, active: g.active ?? true } })
        created++
        continue
      }
      const data = { name: g.name, ...(email !== undefined ? { email } : {}), department: g.department ?? e.department, designation: g.designation ?? e.designation, location: g.location ?? e.location, ...(g.active !== undefined ? { active: g.active } : {}) }
      const same = data.name === e.name && (data.email === undefined || data.email === e.email) && data.department === e.department && data.designation === e.designation && data.location === e.location && (data.active === undefined || data.active === e.active)
      if (same) { unchanged++; continue }
      await prisma.employee.update({ where: { id: e.id }, data })
      updated++
    }
    await audit(prisma, { actorId: user.id, action: "EMPLOYEE.UPLOAD", entity: "Employee", summary: `Uploaded ${fileName}: ${created} added, ${updated} updated, ${unchanged} unchanged, ${errors.length} problem(s)` })
    refresh()
    return {
      rows: sheet.rows.length,
      lines: [`${created} employee${created === 1 ? "" : "s"} added`, `${updated} updated`, ...(unchanged ? [`${unchanged} already up to date`] : [])],
      errors: errors.sort((a, b) => a.row - b.row),
    }
  })
}

const WIN_ALIASES: Record<string, string[]> = {
  empId: ["employee id", "emp id", "empid", "emp no", "employee number", "employee code", "id"],
  name: ["employee name", "emp name", "full name"],
  position: ["place", "rank", "award", "prize position", "result"],
  kind: ["prize type", "type", "reward type"],
  amount: ["voucher amount", "amount", "voucher value", "value", "amount (rs)", "amount (inr)"],
  provider: ["voucher from", "voucher provider", "provider", "brand"],
  item: ["goodie", "goodie (stock code)", "stock code", "item", "goodie code", "item code"],
  quantity: ["qty", "quantity"],
  description: ["prize", "prize description", "description", "note", "notes", "remarks"],
  bonus: ["bonus points", "bonus", "points"],
}

/** Records many winners for one event from a sheet. Each row is saved on its own, so one bad row doesn't stop the rest. */
export async function uploadWinners(eventId: string, form: FormData) {
  return run(async (): Promise<SheetResult> => {
    const user = await assertPermission("rewards:operate")
    const { sheet, present, fileName } = await readUpload(form, WIN_ALIASES, [/winner/i, /prize/i, /result/i])
    if (!present.has("empId") || !present.has("position")) throw new AppError('The sheet needs "Employee ID" and "Position" columns.')
    if (sheet.rows.length > 500) throw new AppError("Upload up to 500 winners at a time.")
    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw new AppError("Event not found.", 404)
    const positions = await awardPositions()
    const items = await prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true } })
    const findItem = (raw: string) => {
      const t = raw.trim().toLowerCase()
      return items.find((i) => i.code.toLowerCase() === t) ?? items.find((i) => i.name.toLowerCase() === t) ?? items.filter((i) => i.name.toLowerCase().includes(t)).at(0)
    }
    const errors: SheetResult["errors"] = []
    let saved = 0
    let marked = 0
    let vouchers = 0
    let voucherTotal = 0
    for (const r of sheet.rows) {
      const empId = (toStr(r.values.empId) ?? "").replace(/\.0$/, "")
      const posRaw = toStr(r.values.position) ?? ""
      const pos = positions.find((p) => p.name.toLowerCase() === posRaw.trim().toLowerCase()) ?? positions.find((p) => p.name.toLowerCase().replace(/[^a-z]/g, "") === posRaw.toLowerCase().replace(/[^a-z]/g, "")) ?? (/^(1|1st|first)$/i.test(posRaw.trim()) ? positions.find((p) => p.name === "Winner") : /^(2|2nd|second)$/i.test(posRaw.trim()) ? positions.find((p) => p.name === "Runner-up") : /^(3|3rd|third)$/i.test(posRaw.trim()) ? positions.find((p) => p.name === "Second runner-up") : undefined)
      const amount = r.values.amount === null || r.values.amount === undefined ? null : toNum(r.values.amount)
      const itemRaw = toStr(r.values.item)
      const kindRaw = (toStr(r.values.kind) ?? "").toLowerCase()
      const kind: AwardInput["kind"] = /voucher|amazon|gift card|card/.test(kindRaw) ? "VOUCHER" : /goodie|stock|item|merch/.test(kindRaw) ? "GOODIE" : /other|trophy|certificate/.test(kindRaw) ? "OTHER" : amount ? "VOUCHER" : itemRaw ? "GOODIE" : "OTHER"
      if (!empId) { errors.push({ row: r.rowNumber, message: "Employee ID is missing" }); continue }
      const posName = pos?.name ?? (posRaw.trim() || null)
      if (!posName) { errors.push({ row: r.rowNumber, message: "Position is missing" }); continue }
      const bonusRaw = r.values.bonus === null || r.values.bonus === undefined ? null : toInt(r.values.bonus)
      if (bonusRaw !== null && Number.isNaN(bonusRaw)) { errors.push({ row: r.rowNumber, message: "Bonus points must be a whole number" }); continue }
      const item = kind === "GOODIE" && itemRaw ? findItem(itemRaw) : undefined
      if (kind === "GOODIE" && !item) { errors.push({ row: r.rowNumber, message: itemRaw ? `No active stock item matches "${itemRaw}" (use the stock code)` : "Goodie prize needs a stock code or item name" }); continue }
      if (kind === "VOUCHER" && (amount === null || Number.isNaN(amount) || amount <= 0)) { errors.push({ row: r.rowNumber, message: "Voucher prize needs an amount in rupees" }); continue }
      const qty = r.values.quantity === null || r.values.quantity === undefined ? 1 : toInt(r.values.quantity)
      try {
        const res = await addAward(eventId, {
          empId, position: posName, kind, stockItemId: item?.id, quantity: Number.isNaN(qty as number) ? 1 : (qty ?? 1), voucherProvider: toStr(r.values.provider) ?? "Amazon",
          voucherAmount: amount ?? undefined, description: toStr(r.values.description) ?? (kind === "OTHER" ? posName : undefined), bonusPoints: bonusRaw ?? pos?.bonusPoints ?? 0,
        }, user)
        saved++
        if (res.markedPresent) marked++
        if (kind === "VOUCHER") { vouchers++; voucherTotal += Math.trunc(amount ?? 0) }
      } catch (e) {
        errors.push({ row: r.rowNumber, message: e instanceof AppError ? e.message : "Couldn't be saved" })
      }
    }
    await audit(prisma, { actorId: user.id, action: "AWARD.UPLOAD", entity: "Event", entityId: eventId, summary: `Uploaded ${fileName} for ${event.code}: ${saved} prize(s) saved, ${errors.length} row(s) with problems` })
    refresh(`/events/${eventId}`, "/prizes")
    return {
      rows: sheet.rows.length,
      lines: [`${saved} winner${saved === 1 ? "" : "s"} saved`, ...(vouchers ? [`${vouchers} voucher${vouchers > 1 ? "s" : ""} worth ₹${voucherTotal.toLocaleString("en-IN")}`] : []), ...(marked ? [`${marked} also marked present`] : [])],
      errors,
    }
  })
}
