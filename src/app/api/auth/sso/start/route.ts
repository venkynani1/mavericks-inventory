import { NextResponse } from "next/server"
import { SSO_COOKIE, SsoError, beginSignIn, redirectUri, ssoConfig } from "@/lib/server/sso"

export const dynamic = "force-dynamic"

/** Step 1 of company sign-in: send the browser to the identity provider. */
export async function GET(req: Request) {
  const cfg = ssoConfig()
  const login = (code: string) => NextResponse.redirect(new URL(`/login?sso_error=${code}`, req.url))
  if (!cfg) return login("disabled")
  const next = new URL(req.url).searchParams.get("next") ?? "/"
  try {
    const { url, cookie } = await beginSignIn(cfg, redirectUri(cfg, req.url, req.headers), next)
    const res = NextResponse.redirect(url)
    res.cookies.set(SSO_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax", // the provider returns with a top-level GET, which lax cookies survive
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/sso",
      maxAge: 600,
    })
    return res
  } catch (e) {
    console.error("SSO start failed:", e)
    return login(e instanceof SsoError ? e.code : "provider_unreachable")
  }
}
