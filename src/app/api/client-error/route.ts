import { getUser } from "@/lib/server/session"

export const dynamic = "force-dynamic"

/** Browser errors are written to the server log (Vercel: project → Logs), so they can be diagnosed. */
export async function POST(req: Request) {
  const user = await getUser().catch(() => null)
  const body = await req.text().catch(() => "")
  console.error(`[client-error] ${user ? `${user.email} (${user.role})` : "signed out"}: ${body.slice(0, 4000)}`)
  return new Response(null, { status: 204 })
}
