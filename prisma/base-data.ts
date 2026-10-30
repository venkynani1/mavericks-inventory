/**
 * Reference data every installation needs: workflow settings, reward rules and the lists people choose from.
 * Idempotent — safe to run on every deploy (existing values are never overwritten). Used by
 * `npm run db:setup`, the demo seed, the Vercel build and the first-admin bootstrap sign-in.
 */
import type { EventCategory, PrismaClient } from "@prisma/client"

export const BASE_SETTINGS = {
  approvalLevels: "1",
  level2Threshold: "0",
  preventNegativeStock: "true",
  escalationHours: "48",
  // Rewards: a milestone every `rewardStep` points, up to `rewardCap`.
  rewardStep: "2000",
  rewardCap: "20000",
  leaderboardForEmployees: "true",
}
export const BASE_CATEGORIES = ["Apparel", "Welcome Kits", "Drinkware", "Bags", "Electronics", "Stationery", "General"]
export const BASE_LOOKUPS: Record<"LOCATION" | "PURPOSE" | "UNIT", string[]> = {
  LOCATION: ["Chennai", "Pune", "Mumbai", "Bengaluru", "Noida"],
  PURPOSE: ["Onboarding", "Internship", "Event - Design-a-thon", "Event - Participation", "Event - La Laurea", "Mavericks Week", "Leaders Connect", "HPL Event", "Corporate Overview", "Farewell", "Points reward"],
  UNIT: ["Nos", "Pack", "Box", "Set"],
}

/** Starting point values. Admins change them under Administration → Rewards rules. */
export const BASE_EVENT_TYPES: { name: string; category: EventCategory; points: number; description: string }[] = [
  { name: "Tech talk", category: "TECH", points: 200, description: "Technical sessions, brown-bags and demos" },
  { name: "Tech event", category: "TECH", points: 300, description: "Conferences, tech days and product showcases" },
  { name: "Webinar", category: "TECH", points: 150, description: "Online technical sessions" },
  { name: "Workshop", category: "WORKSHOP", points: 400, description: "Hands-on workshops and bootcamps" },
  { name: "Hackathon", category: "HACKATHON", points: 600, description: "Hackathons and Design-a-thons" },
  { name: "Codeathon", category: "CODEATHON", points: 500, description: "Coding contests and code sprints" },
  { name: "Non-tech event", category: "NON_TECH", points: 100, description: "Cultural, sports and celebration events" },
  { name: "Leadership connect", category: "NON_TECH", points: 150, description: "Town halls and leader interactions" },
  { name: "CSR activity", category: "OTHER", points: 250, description: "Volunteering and community work" },
]

/** Places that win prizes at events, with default bonus points. Admins change them under Points and rewards rules. */
export const BASE_AWARD_POSITIONS: { name: string; bonusPoints: number }[] = [
  { name: "Winner", bonusPoints: 500 },
  { name: "Runner-up", bonusPoints: 300 },
  { name: "Second runner-up", bonusPoints: 200 },
  { name: "Top performer", bonusPoints: 150 },
  { name: "Special mention", bonusPoints: 100 },
]

/** Milestone names for 2,000 … 20,000. The goodie for each is set later by an admin. */
export const MILESTONE_TITLES = ["Starter", "Explorer", "Contributor", "Achiever", "Champion", "Trailblazer", "Innovator", "Luminary", "Legend", "Maverick"]

export async function ensureBaseData(prisma: PrismaClient, settings: Partial<typeof BASE_SETTINGS> = {}) {
  for (const [key, value] of Object.entries({ ...BASE_SETTINGS, ...settings })) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} })
  }
  await prisma.category.createMany({ data: BASE_CATEGORIES.map((name) => ({ name })), skipDuplicates: true })
  await prisma.lookup.createMany({
    data: Object.entries(BASE_LOOKUPS).flatMap(([kind, values]) => values.map((value, sortOrder) => ({ kind, value, sortOrder }))),
    skipDuplicates: true,
  })
  await prisma.eventType.createMany({ data: BASE_EVENT_TYPES.map((t, sortOrder) => ({ ...t, sortOrder })), skipDuplicates: true })
  await prisma.awardPosition.createMany({ data: BASE_AWARD_POSITIONS.map((p, sortOrder) => ({ ...p, sortOrder })), skipDuplicates: true })
  const step = Number((await prisma.setting.findUnique({ where: { key: "rewardStep" } }))?.value ?? 2000)
  const cap = Number((await prisma.setting.findUnique({ where: { key: "rewardCap" } }))?.value ?? 20000)
  const milestones = []
  for (let t = step, i = 0; t <= cap; t += step, i++) {
    milestones.push({ threshold: t, title: MILESTONE_TITLES[i] ?? `Level ${i + 1}`, description: `Reach ${t.toLocaleString("en-IN")} points` })
  }
  await prisma.rewardMilestone.createMany({ data: milestones, skipDuplicates: true })
}
