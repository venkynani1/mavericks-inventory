import "server-only"
import { memo } from "./memo"
import { prisma } from "@/lib/db"

export const LOOKUPS_TAG = "lookups"

async function load() {
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

// Master data changes rarely, so forms read it from a short in-memory cache, cleared when an admin edits it.
export function getLookups() {
  return memo(LOOKUPS_TAG, 60_000, load)
}
