import "server-only"
import { prisma } from "@/lib/db"

export async function getLookups() {
  const [categories, lookups] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.lookup.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { value: "asc" }] }),
  ])
  const of = (k: string) => lookups.filter((l) => l.kind === k).map((l) => l.value)
  return {
    categories: categories.map((c) => ({ value: c.id, label: c.name })),
    units: of("UNIT").length ? of("UNIT") : ["Nos"],
    locations: of("LOCATION"),
    purposes: of("PURPOSE"),
  }
}
