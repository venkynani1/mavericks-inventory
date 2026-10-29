import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

export type Board = "current" | "quarter" | "lifetime"
export type BoardRow = { id: string; empId: string; name: string; department: string | null; location: string | null; score: number; events: number }

/** Ranked employees. "quarter" counts event points earned in the last 90 days (adjustments excluded). */
export async function leaderboard(board: Board, opts: { dept?: string; take?: number } = {}): Promise<BoardRow[]> {
  const take = opts.take ?? 50
  const dept = opts.dept ? Prisma.sql`AND e.department = ${opts.dept}` : Prisma.empty
  if (board === "quarter") {
    const since = new Date(Date.now() - 90 * 86400_000)
    return prisma.$queryRaw<BoardRow[]>`
      SELECT e.id, e."empId", e.name, e.department, e.location, sum(t.points)::int AS score, count(DISTINCT t."eventId")::int AS events
      FROM "PointsTransaction" t JOIN "Employee" e ON e.id = t."employeeId"
      WHERE t.type = 'EVENT' AND t."createdAt" >= ${since} AND e.active ${dept}
      GROUP BY e.id HAVING sum(t.points) > 0
      ORDER BY score DESC, e.name ASC LIMIT ${take}`
  }
  const col = board === "lifetime" ? Prisma.sql`e."lifetimePoints"` : Prisma.sql`e.points`
  return prisma.$queryRaw<BoardRow[]>`
    SELECT e.id, e."empId", e.name, e.department, e.location, ${col}::int AS score,
           (SELECT count(*)::int FROM "Attendance" a WHERE a."employeeId" = e.id) AS events
    FROM "Employee" e
    WHERE e.active AND ${col} > 0 ${dept}
    ORDER BY ${col} DESC, e.name ASC LIMIT ${take}`
}

export async function departmentBoard() {
  return prisma.$queryRaw<{ department: string; people: number; points: number }[]>`
    SELECT coalesce(department, 'Not set') AS department, count(*)::int AS people, sum(points)::int AS points
    FROM "Employee" WHERE active AND points > 0
    GROUP BY 1 ORDER BY points DESC LIMIT 8`
}
