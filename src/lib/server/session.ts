import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SignJWT, jwtVerify } from "jose"
import { cache } from "react"
import { prisma } from "@/lib/db"
import { can, type Permission, type Role } from "@/lib/roles"

export const SESSION_COOKIE = "mi_session"
const MAX_AGE = 60 * 60 * 10 // 10 hours — one working day

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)")
  return new TextEncoder().encode(s)
}

/** `via` records how the person signed in: their password, or company single sign-on. */
export async function createSession(user: { id: string; role: Role }, via: "password" | "sso" = "password") {
  const token = await new SignJWT({ role: user.role, via })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret())
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  })
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

export type SessionUser = {
  id: string
  name: string
  email: string
  empId: string
  role: Role
  mustChangePw: boolean
  via: "password" | "sso"
}

/** Current user, re-checked against the database so deactivated users lose access immediately. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    if (!payload.sub) return null
    const u = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, empId: true, role: true, active: true, mustChangePw: true },
    })
    if (!u || !u.active) return null
    return { id: u.id, name: u.name, email: u.email, empId: u.empId, role: u.role, mustChangePw: u.mustChangePw, via: payload.via === "sso" ? "sso" : "password" }
  } catch {
    return null
  }
})

export async function requireUser() {
  const u = await getUser()
  if (!u) redirect("/login")
  return u
}

export async function requirePermission(p: Permission) {
  const u = await requireUser()
  if (!can(u.role, p)) redirect("/?denied=1")
  return u
}

/** For server actions/route handlers: throws instead of redirecting. */
export async function assertPermission(p: Permission) {
  const u = await getUser()
  if (!u) throw new AppError("Your session has ended. Sign in again.", 401)
  if (!can(u.role, p)) throw new AppError("Your role doesn't allow this action.", 403)
  return u
}

export class AppError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}
