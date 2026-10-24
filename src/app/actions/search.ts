"use server"

import { prisma } from "@/lib/db"
import { getUser } from "@/lib/server/session"

export async function searchEverything(q: string) {
  if (!(await getUser())) return { items: [], requests: [] }
  const term = q.trim()
  if (term.length < 2) return { items: [], requests: [] }
  const [items, requests] = await Promise.all([
    prisma.stockItem.findMany({
      where: { status: { not: "INACTIVE" }, OR: [{ name: { contains: term, mode: "insensitive" } }, { code: { contains: term, mode: "insensitive" } }, { product: { contains: term, mode: "insensitive" } }] },
      select: { id: true, code: true, name: true, availableQty: true, status: true },
      orderBy: { name: "asc" },
      take: 8,
    }),
    prisma.request.findMany({
      where: { status: { not: "CANCELLED" }, OR: [{ number: { contains: term, mode: "insensitive" } }, { title: { contains: term, mode: "insensitive" } }] },
      select: { id: true, number: true, title: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ])
  return { items, requests }
}
