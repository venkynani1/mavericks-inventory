"use server"

import bcrypt from "bcryptjs"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { audit } from "@/lib/server/audit"
import { createSession, destroySession, getUser } from "@/lib/server/session"
import { run } from "@/lib/server/action"
import { AppError } from "@/lib/server/session"
import { ensureBaseData } from "../../../prisma/base-data"

/**
 * First-run sign-in. While the database has no user accounts, signing in with
 * BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD creates the first System Administrator
 * (who must then choose a new password). Once any account exists this does nothing.
 */
async function bootstrapFirstAdmin(email: string, password: string) {
  const bEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  const bPass = process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (!bEmail || !bPass || bPass.length < 10 || email !== bEmail || password !== bPass) return null
  if ((await prisma.user.count()) > 0) return null
  await ensureBaseData(prisma)
  const user = await prisma.user.create({
    data: { empId: "ADMIN", name: "System Administrator", email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10), mustChangePw: true },
  })
  await audit(prisma, { actorId: user.id, action: "SYSTEM.BOOTSTRAP", entity: "User", entityId: user.id, summary: "First administrator created from the bootstrap sign-in" })
  return user
}

export type LoginState = { error?: string; email?: string }

// Simple in-memory throttle per email (per server instance). Put a WAF / Azure Front Door / AWS WAF rule in front for production.
const attempts = new Map<string, { n: number; until: number }>()

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  const password = String(form.get("password") ?? "")
  const next = String(form.get("next") ?? "/")
  if (!email || !password) return { error: "Enter your email and password.", email }

  const a = attempts.get(email)
  if (a && a.until > Date.now()) return { error: "Too many attempts. Wait a few minutes, then try again.", email }

  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) user = await bootstrapFirstAdmin(email, password)
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash))
  if (!ok || !user) {
    const n = (a?.n ?? 0) + 1
    attempts.set(email, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 })
    return { error: user && !user.active ? "This account is deactivated. Contact the administrator." : "That email and password don't match.", email }
  }
  attempts.delete(email)
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await audit(prisma, { actorId: user.id, action: "USER.LOGIN", entity: "User", entityId: user.id, summary: `${user.name} signed in` })
  await createSession({ id: user.id, role: user.role })
  redirect(user.mustChangePw ? "/profile?first=1" : next.startsWith("/") && !next.startsWith("//") ? next : "/")
}

export async function logout() {
  await destroySession()
  redirect("/login")
}

const pwSchema = z
  .object({ current: z.string().min(1), next: z.string().min(10, "Use at least 10 characters").regex(/[A-Za-z]/, "Include a letter").regex(/[0-9]/, "Include a number"), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "The new passwords don't match", path: ["confirm"] })

export async function changePassword(input: { current: string; next: string; confirm: string }) {
  return run(async () => {
    const me = await getUser()
    if (!me) throw new AppError("Sign in again.")
    const parsed = pwSchema.safeParse(input)
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message)
    const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } })
    if (!(await bcrypt.compare(input.current, u.passwordHash))) throw new AppError("Your current password is incorrect.")
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(input.next, 10), mustChangePw: false } })
    await audit(prisma, { actorId: me.id, action: "USER.PASSWORD", entity: "User", entityId: me.id, summary: "Changed own password" })
  }, "Password updated")
}
