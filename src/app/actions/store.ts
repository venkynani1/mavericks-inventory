"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { run } from "@/lib/server/action"
import { requestEventGoodies, returnEventGoodies } from "@/lib/server/event-goodies"
import { AppError, assertPermission } from "@/lib/server/session"
import { acceptOrder, cancelOrder, markCollected, placeOrder, rejectOrder, saveCatalogItem, type CartLine, type CatalogInput, type PickupInput } from "@/lib/server/store"

const refreshStore = () => {
  for (const p of ["/me", "/me/store", "/me/orders", "/me/history", "/redemptions", "/admin/rewards", "/"]) revalidatePath(p)
}

async function myEmployeeId() {
  const user = await assertPermission("portal:self")
  const emp = await prisma.employee.findFirst({ where: { user: { id: user.id } }, select: { id: true } })
  if (!emp) throw new AppError("Your sign-in isn't linked to an employee record yet. Ask the engagement team.", 409)
  return { user, employeeId: emp.id }
}

// ---------------- employee ----------------

export async function placeStoreOrder(cart: CartLine[], note?: string) {
  return run(async () => {
    const { user, employeeId } = await myEmployeeId()
    const r = await placeOrder(employeeId, cart, note, user)
    refreshStore()
    return r
  })
}

export async function cancelStoreOrder(id: string) {
  return run(async () => {
    const { user, employeeId } = await myEmployeeId()
    await cancelOrder(id, employeeId, user)
    refreshStore()
  }, "Order cancelled. Your points are back.")
}

// ---------------- engagement team ----------------

export async function acceptStoreOrder(id: string, pickup: PickupInput) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    const r = await acceptOrder(id, pickup, user)
    refreshStore()
    return r
  })
}

export async function rejectStoreOrder(id: string, reason: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    await rejectOrder(id, reason, user)
    refreshStore()
  }, "Order rejected. The points went back to the employee.")
}

export async function collectStoreOrder(id: string) {
  return run(async () => {
    const user = await assertPermission("rewards:operate")
    await markCollected(id, user)
    refreshStore()
  }, "Marked collected")
}

// ---------------- administrator ----------------

export async function saveStoreItem(id: string | null, input: CatalogInput) {
  return run(async () => {
    const user = await assertPermission("rewards:configure")
    await saveCatalogItem(id, input, user)
    refreshStore()
  }, "Saved. The store shows the change straight away.")
}

// ---------------- event goodies (approved before the event) ----------------

type Line = { stockItemId: string; quantity: number }

export async function requestGoodiesForEvent(eventId: string, lines: Line[], note: string | undefined, submit: boolean) {
  return run(async () => {
    const user = await assertPermission("request:create")
    const r = await requestEventGoodies(eventId, { lines, note, submit }, user)
    for (const p of [`/events/${eventId}`, "/requests", "/approvals", "/"]) revalidatePath(p)
    return { id: r.id, number: r.number }
  })
}

export async function returnGoodiesFromEvent(eventId: string, lines: Line[], note?: string) {
  return run(async () => {
    const user = await assertPermission("request:create")
    const r = await returnEventGoodies(eventId, { lines, note }, user)
    for (const p of [`/events/${eventId}`, "/requests", "/approvals"]) revalidatePath(p)
    return { id: r.id, number: r.number }
  })
}
