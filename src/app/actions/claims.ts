"use server"

import { revalidatePath } from "next/cache"
import { run } from "@/lib/server/action"
import { closeDesk, handOverClaim, openDesk, rejectClaim, submitClaim } from "@/lib/server/claims"
import { assertPermission } from "@/lib/server/session"

export async function openGoodiesDesk(eventId: string, stockItemId: string, qty: number) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    await openDesk(eventId, stockItemId, qty, user)
    revalidatePath(`/events/${eventId}/desk`)
  }, "Desk open. Show the QR code.")
}

export async function closeGoodiesDesk(eventId: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    await closeDesk(eventId, user)
    revalidatePath(`/events/${eventId}/desk`)
  }, "Desk closed. The QR code no longer works.")
}

/** Public: called from the page the QR code opens. No sign-in. */
export async function claimGoodie(token: string, empId: string, name: string) {
  return run(async () => submitClaim(String(token).slice(0, 64), { empId, name }))
}

export async function handOverGoodie(claimId: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const r = await handOverClaim(claimId, user)
    revalidatePath("/events")
    return r
  })
}

export async function rejectGoodieClaim(claimId: string, reason: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    await rejectClaim(claimId, reason, user)
  }, "Claim rejected")
}
