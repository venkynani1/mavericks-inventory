import { unauthorized } from "@/lib/server/api"
import { noticesFor } from "@/lib/server/notifications"
import { getUser } from "@/lib/server/session"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getUser()
  if (!user) return unauthorized()
  return Response.json({ notices: await noticesFor(user) }, { headers: { "Cache-Control": "private, no-store" } })
}
