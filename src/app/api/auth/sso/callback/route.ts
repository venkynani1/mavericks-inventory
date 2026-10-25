import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { audit } from "@/lib/server/audit"
import { createSession } from "@/lib/server/session"
import { SSO_COOKIE, SsoError, completeSignIn, ssoConfig, type SsoIdentity } from "@/lib/server/sso"

export const dynamic = "force-dynamic"

/**
 * Step 2 of company sign-in: the provider sends the browser back here with a one-time code.
 * We verify it, find or create the person, keep their role in step with the provider, and start a session.
 */
export async function GET(req: Request) {
  const cfg = ssoConfig()
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/login?sso_error=${code}`, req.url))
    res.cookies.delete({ name: SSO_COOKIE, path: "/api/auth/sso" })
    return res
  }
  if (!cfg) return fail("disabled")

  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${SSO_COOKIE}=([^;]+)`))?.[1]
  let identity: SsoIdentity, next: string
  try {
    ;({ identity, next } = await completeSignIn(cfg, new URL(req.url).searchParams, cookie))
  } catch (e) {
    console.error("SSO callback failed:", e instanceof Error ? e.message : e)
    return fail(e instanceof SsoError ? e.code : "token_exchange_failed")
  }

  // Find the person: first by their SSO identity, then by email (links an existing account on first SSO sign-in).
  let user =
    (await prisma.user.findUnique({ where: { ssoSubject: identity.subject } })) ??
    (await prisma.user.findFirst({ where: { email: { equals: identity.email, mode: "insensitive" } } }))

  if (!user) {
    if (!cfg.autoCreate || !identity.role) {
      await audit(prisma, { action: "USER.SSO_DENIED", entity: "User", summary: `SSO sign-in refused for ${identity.email}: no app role assigned (${identity.rawRoles.join(", ") || "none"})` })
      return fail("no_access")
    }
    user = await prisma.user.create({
      data: {
        empId: identity.employeeId ?? `SSO-${randomBytes(4).toString("hex").toUpperCase()}`,
        name: identity.name,
        email: identity.email,
        role: identity.role,
        ssoSubject: identity.subject,
        // Random, never shared: SSO users don't sign in with a password unless an admin resets one.
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      },
    })
    await audit(prisma, { actorId: user.id, action: "USER.SSO_CREATE", entity: "User", entityId: user.id, summary: `Account created on first company sign-in for ${user.name} (${user.role})` })
  }
  if (!user.active) return fail("inactive")

  const updates: { ssoSubject?: string; role?: typeof user.role; lastLoginAt: Date } = { lastLoginAt: new Date() }
  if (user.ssoSubject !== identity.subject) updates.ssoSubject = identity.subject
  if (cfg.rolesFromIdp && identity.role && identity.role !== user.role) {
    await audit(prisma, { actorId: user.id, action: "USER.SSO_ROLE_SYNC", entity: "User", entityId: user.id, summary: `Role changed from ${user.role} to ${identity.role} by the identity provider`, before: { role: user.role }, after: { role: identity.role } })
    updates.role = identity.role
  }
  user = await prisma.user.update({ where: { id: user.id }, data: updates })
  await audit(prisma, { actorId: user.id, action: "USER.LOGIN", entity: "User", entityId: user.id, summary: `${user.name} signed in with ${cfg.providerName}` })

  await createSession({ id: user.id, role: user.role }, "sso")
  const res = NextResponse.redirect(new URL(next, req.url))
  res.cookies.delete({ name: SSO_COOKIE, path: "/api/auth/sso" })
  return res
}
