import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"

const PUBLIC = ["/login", "/api/health"]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next()
  const token = req.cookies.get("mi_session")?.value
  let valid = false
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET))
      valid = true
    } catch {}
  }
  if (valid) {
    // Pass the path to server layouts (used to hold users with a one-time password on the profile page).
    const headers = new Headers(req.headers)
    headers.set("x-pathname", pathname)
    const res = NextResponse.next({ request: { headers } })
    res.headers.set("X-Frame-Options", "DENY")
    res.headers.set("X-Content-Type-Options", "nosniff")
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
    return res
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, { status: 401 })
  const url = req.nextUrl.clone()
  url.pathname = "/login"
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
}
