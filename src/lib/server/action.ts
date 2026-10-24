import "server-only"
import { Prisma } from "@prisma/client"
import { AppError } from "./session"

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Turns thrown errors into a result the client can show, without leaking internals. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data, message }
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { ok: false, error: "That value is already in use. Choose a different one." }
      if (e.code === "P2025") return { ok: false, error: "The record no longer exists. Refresh and try again." }
    }
    if (e && typeof e === "object" && "digest" in e) throw e // let Next.js redirects/notFound through
    console.error(e)
    return { ok: false, error: "Something went wrong on the server. Try again, and contact the administrator if it keeps happening." }
  }
}
