import "server-only"
import { createHash, randomBytes } from "crypto"
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import type { Role } from "@/lib/roles"

/**
 * Company single sign-on (OpenID Connect, authorization-code flow with PKCE).
 *
 * Works with Microsoft Entra ID (Azure AD), Okta, Google Workspace, Ping, Keycloak, Auth0 —
 * anything that publishes /.well-known/openid-configuration. It is OFF unless SSO_ISSUER,
 * SSO_CLIENT_ID and SSO_CLIENT_SECRET are set. See docs/SETUP-AND-DEPLOYMENT.md §13.
 */

const DEFAULT_ROLE_MAP: Record<string, Role> = {
  "Inventory.Executive": "EXECUTIVE",
  "Inventory.Manager": "MANAGER",
  "Inventory.Authority": "AUTHORITY",
  "Inventory.Admin": "ADMIN",
}
// If someone holds several roles, the most senior one wins.
const ROLE_RANK: Role[] = ["ADMIN", "AUTHORITY", "MANAGER", "EXECUTIVE"]

export type SsoConfig = {
  issuer: string
  clientId: string
  clientSecret: string
  providerName: string
  scopes: string
  roleClaim: string
  roleMap: Record<string, Role>
  autoCreate: boolean
  rolesFromIdp: boolean
  ssoOnly: boolean
  allowedDomains: string[]
  signOutEverywhere: boolean
  appUrl: string | null
}

const bool = (v: string | undefined, dflt: boolean) => (v === undefined || v === "" ? dflt : v.toLowerCase() === "true")

export function ssoConfig(): SsoConfig | null {
  const issuer = process.env.SSO_ISSUER?.trim().replace(/\/+$/, "")
  const clientId = process.env.SSO_CLIENT_ID?.trim()
  const clientSecret = process.env.SSO_CLIENT_SECRET?.trim()
  if (!issuer || !clientId || !clientSecret) return null
  let roleMap = DEFAULT_ROLE_MAP
  if (process.env.SSO_ROLE_MAP) {
    try {
      roleMap = JSON.parse(process.env.SSO_ROLE_MAP)
    } catch {
      console.error("SSO_ROLE_MAP is not valid JSON; using the default Inventory.* role names")
    }
  }
  return {
    issuer,
    clientId,
    clientSecret,
    providerName: process.env.SSO_PROVIDER_NAME?.trim() || "Microsoft",
    scopes: process.env.SSO_SCOPES?.trim() || "openid profile email",
    roleClaim: process.env.SSO_ROLE_CLAIM?.trim() || "roles",
    roleMap,
    autoCreate: bool(process.env.SSO_AUTO_CREATE, true),
    rolesFromIdp: bool(process.env.SSO_ROLES_FROM_IDP, true),
    ssoOnly: bool(process.env.SSO_ONLY, false),
    allowedDomains: (process.env.SSO_ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
    signOutEverywhere: bool(process.env.SSO_SIGN_OUT_EVERYWHERE, false),
    appUrl: process.env.APP_URL?.trim().replace(/\/+$/, "") || null,
  }
}

// ---------- provider metadata (cached per server instance) ----------

type Metadata = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; end_session_endpoint?: string }
let metaCache: { issuer: string; at: number; meta: Metadata } | null = null
let jwks: { uri: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null

export async function providerMetadata(cfg: SsoConfig): Promise<Metadata> {
  if (metaCache && metaCache.issuer === cfg.issuer && Date.now() - metaCache.at < 3600_000) return metaCache.meta
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: "no-store" })
  if (!res.ok) throw new SsoError("provider_unreachable", `Discovery returned ${res.status}`)
  const meta = (await res.json()) as Metadata
  if (meta.issuer.replace(/\/+$/, "") !== cfg.issuer) throw new SsoError("provider_misconfigured", `Issuer mismatch: ${meta.issuer}`)
  metaCache = { issuer: cfg.issuer, at: Date.now(), meta }
  return meta
}

function keySet(uri: string) {
  if (!jwks || jwks.uri !== uri) jwks = { uri, set: createRemoteJWKSet(new URL(uri)) }
  return jwks.set
}

// ---------- the round trip ----------

export class SsoError extends Error {
  constructor(public code: string, detail?: string) {
    super(detail ?? code)
  }
}

const b64url = (b: Buffer) => b.toString("base64url")
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "")
export const SSO_COOKIE = "mi_sso"

/** Where the provider sends people back. Must match the redirect URI registered with the provider. */
export function redirectUri(cfg: SsoConfig, requestUrl: string, headers: Headers) {
  if (cfg.appUrl) return `${cfg.appUrl}/api/auth/sso/callback`
  const u = new URL(requestUrl)
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? u.host
  const proto = headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "")
  return `${proto}://${host}/api/auth/sso/callback`
}

/** Builds the provider sign-in URL and a short-lived signed cookie holding state, nonce and the PKCE verifier. */
export async function beginSignIn(cfg: SsoConfig, redirect: string, next: string) {
  const meta = await providerMetadata(cfg)
  const state = b64url(randomBytes(24))
  const nonce = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash("sha256").update(verifier).digest())
  const cookie = await new SignJWT({ state, nonce, verifier, next, redirect })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret())
  const url = new URL(meta.authorization_endpoint)
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirect,
    scope: cfg.scopes,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString()
  return { url: url.toString(), cookie }
}

export type SsoIdentity = { subject: string; email: string; name: string; employeeId: string | null; role: Role | null; rawRoles: string[] }

/** Validates the callback, exchanges the code and verifies the ID token. */
export async function completeSignIn(cfg: SsoConfig, params: URLSearchParams, cookie: string | undefined): Promise<{ identity: SsoIdentity; next: string }> {
  if (params.get("error")) throw new SsoError("provider_error", `${params.get("error")}: ${params.get("error_description") ?? ""}`)
  if (!cookie) throw new SsoError("session_expired")
  let saved: JWTPayload & { state?: string; nonce?: string; verifier?: string; next?: string; redirect?: string }
  try {
    saved = (await jwtVerify(cookie, secret())).payload
  } catch {
    throw new SsoError("session_expired")
  }
  const code = params.get("code")
  if (!code || !params.get("state") || params.get("state") !== saved.state) throw new SsoError("state_mismatch")

  const meta = await providerMetadata(cfg)
  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: saved.redirect!,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: saved.verifier!,
    }),
    cache: "no-store",
  })
  const tokens = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string }
  if (!res.ok || !tokens.id_token) throw new SsoError("token_exchange_failed", `${tokens.error ?? res.status} ${tokens.error_description ?? ""}`)

  let claims: JWTPayload & Record<string, unknown>
  try {
    claims = (await jwtVerify(tokens.id_token, keySet(meta.jwks_uri), { issuer: meta.issuer, audience: cfg.clientId, clockTolerance: 60 })).payload
  } catch (e) {
    throw new SsoError("invalid_token", e instanceof Error ? e.message : undefined)
  }
  if (claims.nonce !== saved.nonce) throw new SsoError("invalid_token", "nonce mismatch")

  const email = String(claims.email ?? claims.preferred_username ?? claims.upn ?? "").trim().toLowerCase()
  if (!email.includes("@")) throw new SsoError("no_email")
  if (cfg.allowedDomains.length && !cfg.allowedDomains.includes(email.split("@")[1])) throw new SsoError("domain_not_allowed")

  const raw = claims[cfg.roleClaim]
  const rawRoles = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String)
  const mapped = rawRoles.map((r) => cfg.roleMap[r]).filter(Boolean) as Role[]
  const role = ROLE_RANK.find((r) => mapped.includes(r)) ?? null

  const name = String(claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(" ") ?? "").trim() || email.split("@")[0]
  const employeeId = claims.employeeid ?? claims.employee_id ?? claims.employeeId
  const next = typeof saved.next === "string" && saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/"
  return {
    identity: { subject: `${meta.issuer}|${claims.sub}`, email, name, employeeId: employeeId ? String(employeeId) : null, role, rawRoles },
    next,
  }
}

export async function endSessionUrl(cfg: SsoConfig, postLogout: string) {
  if (!cfg.signOutEverywhere) return null
  const meta = await providerMetadata(cfg).catch(() => null)
  if (!meta?.end_session_endpoint) return null
  const u = new URL(meta.end_session_endpoint)
  u.searchParams.set("post_logout_redirect_uri", postLogout)
  u.searchParams.set("client_id", cfg.clientId)
  return u.toString()
}

/** Messages shown on the sign-in page for ?sso_error=… */
export const SSO_ERROR_TEXT: Record<string, string> = {
  provider_error: "Company sign-in was cancelled or refused. Try again, or contact the administrator.",
  provider_unreachable: "The company sign-in service can't be reached right now. Try again in a few minutes.",
  provider_misconfigured: "Company sign-in isn't set up correctly. Contact the administrator.",
  session_expired: "The sign-in took too long. Start again.",
  state_mismatch: "The sign-in couldn't be verified. Start again from this page.",
  token_exchange_failed: "Company sign-in couldn't be completed. Contact the administrator if this keeps happening.",
  invalid_token: "Company sign-in couldn't be verified. Contact the administrator.",
  no_email: "Your company account has no email address. Contact the administrator.",
  domain_not_allowed: "Your email domain isn't allowed to use this app.",
  no_access: "You don't have access to Mavericks Inventory yet. Ask the administrator to assign you a role.",
  inactive: "Your account is deactivated. Contact the administrator.",
  disabled: "Company sign-in isn't switched on.",
}
