import { z } from "zod"
import { apiError, unauthorized } from "@/lib/server/api"
import { answerOffline, answerWithClaude, answerWithOpenAICompatible, assistantProvider, contextFor, suggestionsFor } from "@/lib/server/assistant"
import { getUser } from "@/lib/server/session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).min(1).max(30),
})

// Small per-person limit so a stuck script can't run up an API bill.
const hits = new Map<string, number[]>()
function limited(id: string) {
  const now = Date.now()
  const recent = (hits.get(id) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(id, recent)
  return recent.length > 20
}

export async function GET() {
  const user = await getUser()
  if (!user) return unauthorized()
  return Response.json({ suggestions: suggestionsFor(user.role), mode: assistantProvider()?.name ?? "built-in" })
}

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return unauthorized()
  if (limited(user.id)) return apiError(429, "RATE_LIMITED", "That's a lot of questions in a minute. Wait a moment and try again.")
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiError(400, "INVALID_INPUT", "Send { messages: [{ role, text }] }.")
  const msgs = parsed.data.messages
  const last = msgs[msgs.length - 1]
  if (last.role !== "user" || !last.text.trim()) return apiError(400, "INVALID_INPUT", "The last message must be a question.")
  const ctx = await contextFor(user)
  try {
    const p = assistantProvider()
    if (p) return Response.json({ ...(await (p.kind === "anthropic" ? answerWithClaude(msgs, ctx) : answerWithOpenAICompatible(msgs, ctx, p))), mode: p.name })
  } catch (e) {
    console.error("assistant: falling back to built-in answers", e)
  }
  const out = await answerOffline(last.text, ctx)
  return Response.json({ text: out.text, links: out.links ?? [], mode: "built-in" })
}
