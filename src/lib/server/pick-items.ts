import "server-only"
import { prisma } from "@/lib/db"

export async function pickableItems() {
  const items = await prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true, availableQty: true }, orderBy: [{ product: "asc" }, { name: "asc" }] })
  return items.map((i) => ({ id: i.id, code: i.code, name: i.name, available: i.availableQty }))
}
