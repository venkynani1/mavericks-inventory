"use server"

import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { getUser } from "@/lib/server/session"

const EMPTY = { items: [], requests: [], employees: [], events: [] }

export async function searchEverything(q: string) {
  const user = await getUser()
  if (!user || !can(user.role, "inventory:view")) return EMPTY
  const term = q.trim()
  if (term.length < 2) return EMPTY
  const ci = { contains: term, mode: "insensitive" as const }
  const [items, requests, employees, events] = await Promise.all([
    prisma.stockItem.findMany({
      where: { status: { not: "INACTIVE" }, OR: [{ name: ci }, { code: ci }, { product: ci }] },
      select: { id: true, code: true, name: true, availableQty: true, status: true },
      orderBy: { name: "asc" },
      take: 6,
    }),
    prisma.request.findMany({
      where: { status: { not: "CANCELLED" }, OR: [{ number: ci }, { title: ci }] },
      select: { id: true, number: true, title: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.employee.findMany({
      where: { OR: [{ name: ci }, { empId: { contains: term } }, { email: ci }] },
      select: { id: true, empId: true, name: true, points: true },
      orderBy: { name: "asc" },
      take: 5,
    }),
    prisma.event.findMany({
      where: { OR: [{ name: ci }, { code: ci }] },
      select: { id: true, code: true, name: true, date: true },
      orderBy: { date: "desc" },
      take: 4,
    }),
  ])
  return { items, requests, employees, events }
}
