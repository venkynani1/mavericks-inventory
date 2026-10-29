"use server"

import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { revalidatePath, revalidateTag } from "next/cache"
import { isSharedDemo } from "@/lib/demo"
import { LOOKUPS_TAG } from "@/lib/server/lookups"
import { SETTINGS_TAG } from "@/lib/server/settings"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { run } from "@/lib/server/action"
import { audit } from "@/lib/server/audit"
import { AppError, assertPermission } from "@/lib/server/session"

const roleEnum = z.enum(["EXECUTIVE", "MANAGER", "AUTHORITY", "ADMIN", "EMPLOYEE"])
const userSchema = z.object({
  empId: z.string().trim().min(2, "Enter the employee ID").max(20),
  name: z.string().trim().min(2, "Enter the name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: roleEnum,
  department: z.string().trim().max(80).optional(),
  location: z.string().trim().max(60).optional(),
})
export type UserInput = z.input<typeof userSchema>

// No look-alike characters (0/O, 1/l/I), so a password read out over a call is typed correctly first time.
const SAFE = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
function tempPassword() {
  const bytes = randomBytes(12)
  const chars = Array.from(bytes, (b) => SAFE[b % SAFE.length])
  // e.g. "K7qM-X9rT-4hNc": ~70 bits, grouped for reading aloud
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join("")).join("-")
}

function parse<T>(s: z.ZodType<T>, v: unknown) {
  const r = s.safeParse(v)
  if (!r.success) throw new AppError(r.error.issues[0].message)
  return r.data
}

export async function createUser(input: UserInput) {
  return run(async () => {
    const admin = await assertPermission("admin:manage")
    const v = parse(userSchema, input)
    const pw = tempPassword()
    const u = await prisma.user.create({
      data: { ...v, department: v.department || null, location: v.location || null, passwordHash: await bcrypt.hash(pw, 10), mustChangePw: true },
    })
    await audit(prisma, { actorId: admin.id, action: "USER.CREATE", entity: "User", entityId: u.id, summary: `Created ${u.name} (${u.role})`, after: { ...u, passwordHash: undefined } })
    revalidatePath("/admin/users")
    return { tempPassword: pw }
  })
}

export async function updateUser(id: string, input: UserInput & { active: boolean }) {
  return run(async () => {
    const admin = await assertPermission("admin:manage")
    const v = parse(userSchema, input)
    const before = await prisma.user.findUniqueOrThrow({ where: { id } })
    if (isSharedDemo(before.email) && (v.role !== before.role || !input.active || v.email !== before.email))
      throw new AppError("This is a shared demo account. Its email, role and status stay fixed so the demo keeps working.")
    if (id === admin.id && (v.role !== "ADMIN" || !input.active)) throw new AppError("You can't remove your own admin access. Ask another administrator.")
    if (before.role === "ADMIN" && (v.role !== "ADMIN" || !input.active)) {
      const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } })
      if (admins <= 1) throw new AppError("This is the last active administrator. Add another admin first.")
    }
    const after = await prisma.user.update({ where: { id }, data: { ...v, department: v.department || null, location: v.location || null, active: input.active } })
    const strip = (u: typeof before) => ({ ...u, passwordHash: undefined })
    await audit(prisma, { actorId: admin.id, action: "USER.UPDATE", entity: "User", entityId: id, summary: `Updated ${after.name}${before.role !== after.role ? `, role ${before.role} → ${after.role}` : ""}${before.active !== after.active ? (after.active ? ", reactivated" : ", deactivated") : ""}`, before: strip(before), after: strip(after) })
    revalidatePath("/admin/users")
  }, "User saved")
}

export async function resetPassword(id: string) {
  return run(async () => {
    const admin = await assertPermission("admin:manage")
    const target = await prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true } })
    if (isSharedDemo(target.email)) throw new AppError("This is a shared demo account, so its password can't be reset.")
    const pw = tempPassword()
    const u = await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(pw, 10), mustChangePw: true } })
    await audit(prisma, { actorId: admin.id, action: "USER.RESET_PASSWORD", entity: "User", entityId: id, summary: `Reset password for ${u.name}` })
    return { tempPassword: pw }
  })
}

const settingsSchema = z.object({
  approvalLevels: z.union([z.literal(1), z.literal(2)]),
  level2Threshold: z.coerce.number().int().min(0).max(1_000_000),
  preventNegativeStock: z.boolean(),
  escalationHours: z.coerce.number().int().min(1, "At least 1 hour").max(720),
})

export async function saveSettings(input: z.input<typeof settingsSchema>) {
  return run(async () => {
    const admin = await assertPermission("admin:manage")
    const v = parse(settingsSchema, input)
    const before = Object.fromEntries((await prisma.setting.findMany()).map((s) => [s.key, s.value]))
    const entries = Object.entries(v).map(([key, value]) => ({ key, value: String(value) }))
    await prisma.$transaction(entries.map((e) => prisma.setting.upsert({ where: { key: e.key }, create: { ...e, updatedBy: admin.id }, update: { value: e.value, updatedBy: admin.id } })))
    await audit(prisma, { actorId: admin.id, action: "SETTINGS.UPDATE", entity: "Setting", summary: `Workflow rules updated: ${v.approvalLevels} level(s), stock guard ${v.preventNegativeStock ? "on" : "off"}`, before, after: v })
    revalidateTag(SETTINGS_TAG)
    revalidatePath("/admin/workflow")
  }, "Workflow rules saved. New submissions use them; requests already in review keep their levels.")
}

export async function addCategory(name: string) {
  return run(async () => {
    const admin = await assertPermission("admin:manage")
    const n = name.trim()
    if (n.length < 2) throw new AppError("Enter a category name.")
    const c = await prisma.category.create({ data: { name: n } })
    await audit(prisma, { actorId: admin.id, action: "MASTER.CATEGORY_ADD", entity: "Category", entityId: c.id, summary: `Added category ${n}` })
    revalidateTag(LOOKUPS_TAG)
    revalidatePath("/admin/masters")
  }, "Category added")
}

export async function toggleCategory(id: string, active: boolean) {
  return run(async () => {
    const admin = await assertPermission("admin:manage")
    const c = await prisma.category.update({ where: { id }, data: { active } })
    await audit(prisma, { actorId: admin.id, action: "MASTER.CATEGORY_TOGGLE", entity: "Category", entityId: id, summary: `${active ? "Enabled" : "Disabled"} category ${c.name}` })
    revalidateTag(LOOKUPS_TAG)
    revalidatePath("/admin/masters")
  })
}

export async function addLookup(kind: "LOCATION" | "PURPOSE" | "UNIT", value: string) {
  return run(async () => {
    const admin = await assertPermission("admin:manage")
    const v = value.trim()
    if (v.length < 1) throw new AppError("Enter a value.")
    const max = await prisma.lookup.aggregate({ where: { kind }, _max: { sortOrder: true } })
    const l = await prisma.lookup.create({ data: { kind, value: v, sortOrder: (max._max.sortOrder ?? 0) + 1 } })
    await audit(prisma, { actorId: admin.id, action: "MASTER.LOOKUP_ADD", entity: "Lookup", entityId: l.id, summary: `Added ${kind.toLowerCase()} ${v}` })
    revalidateTag(LOOKUPS_TAG)
    revalidatePath("/admin/masters")
  }, "Added")
}

export async function toggleLookup(id: string, active: boolean) {
  return run(async () => {
    const admin = await assertPermission("admin:manage")
    const l = await prisma.lookup.update({ where: { id }, data: { active } })
    await audit(prisma, { actorId: admin.id, action: "MASTER.LOOKUP_TOGGLE", entity: "Lookup", entityId: id, summary: `${active ? "Enabled" : "Disabled"} ${l.kind.toLowerCase()} ${l.value}` })
    revalidateTag(LOOKUPS_TAG)
    revalidatePath("/admin/masters")
  })
}
