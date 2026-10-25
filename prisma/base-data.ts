/**
 * Reference data every installation needs: workflow settings and the lists people choose from.
 * Idempotent — safe to run on every deploy. Used by `npm run db:setup`, the demo seed,
 * and the first-admin bootstrap sign-in.
 */
import type { PrismaClient } from "@prisma/client"

export const BASE_SETTINGS = { approvalLevels: "1", level2Threshold: "0", preventNegativeStock: "true", escalationHours: "48" }
export const BASE_CATEGORIES = ["Apparel", "Welcome Kits", "Drinkware", "Bags", "Electronics", "Stationery", "General"]
export const BASE_LOOKUPS: Record<"LOCATION" | "PURPOSE" | "UNIT", string[]> = {
  LOCATION: ["Chennai", "Pune", "Mumbai", "Bengaluru", "Noida"],
  PURPOSE: ["Onboarding", "Internship", "Event - Design-a-thon", "Event - Participation", "Event - La Laurea", "Mavericks Week", "Leaders Connect", "HPL Event", "Corporate Overview", "Farewell"],
  UNIT: ["Nos", "Pack", "Box", "Set"],
}

export async function ensureBaseData(prisma: PrismaClient, settings: Partial<typeof BASE_SETTINGS> = {}) {
  for (const [key, value] of Object.entries({ ...BASE_SETTINGS, ...settings })) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} })
  }
  await prisma.category.createMany({ data: BASE_CATEGORIES.map((name) => ({ name })), skipDuplicates: true })
  await prisma.lookup.createMany({
    data: Object.entries(BASE_LOOKUPS).flatMap(([kind, values]) => values.map((value, sortOrder) => ({ kind, value, sortOrder }))),
    skipDuplicates: true,
  })
}
