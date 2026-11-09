import "server-only"
import { prisma } from "@/lib/db"

/** Everything shown on an employee's profile (staff view) or their own portal. */
export async function employeeOverview(id: string) {
  const emp = await prisma.employee.findUnique({ where: { id }, include: { user: { select: { email: true, active: true } } } })
  if (!emp) return null
  const [claims, orders, awards, rewards, history, attended, lines, rank, milestones] = await Promise.all([
    prisma.eventClaim.findMany({ where: { employeeId: id, status: "HANDED" }, orderBy: { decidedAt: "desc" }, include: { stockItem: { select: { name: true } }, event: { select: { id: true, name: true, code: true } } } }),
    prisma.redemptionOrder.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" }, take: 50, include: { lines: true } }),
    prisma.eventAward.findMany({ where: { employeeId: id, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, include: { event: { select: { id: true, name: true, date: true, code: true } }, stockItem: { select: { name: true } } } }),
    prisma.rewardEarned.findMany({ where: { employeeId: id }, orderBy: [{ cycle: "desc" }, { threshold: "asc" }], include: { line: { include: { stockItem: { select: { name: true } }, request: { select: { number: true, id: true } } } } } }),
    prisma.pointsTransaction.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" }, take: 200, include: { event: { select: { id: true, code: true, name: true } } } }),
    prisma.attendance.findMany({ where: { employeeId: id }, orderBy: { event: { date: "desc" } }, include: { event: { include: { eventType: true } } } }),
    prisma.distributionLine.findMany({ where: { recipientId: emp.empId, request: { status: "APPROVED" } }, orderBy: { distributedOn: "desc" }, include: { stockItem: { select: { name: true, code: true } }, request: { select: { number: true, id: true } } } }),
    prisma.employee.count({ where: { active: true, points: { gt: emp.points } } }),
    prisma.rewardMilestone.findMany({ where: { active: true }, orderBy: { threshold: "asc" }, include: { stockItem: { select: { name: true } } } }),
  ])
  const actorIds = [...new Set(history.map((h) => h.actorId))]
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  // Every goodie actually received, whichever way it came: a distribution (including prizes and milestone
  // rewards), the QR desk at an event, or a points-store order collected.
  const goodies = [
    ...lines.map((g) => ({ id: `d-${g.id}`, name: g.stockItem.name, quantity: g.quantity, date: g.distributedOn, detail: [g.purpose, g.remarks].filter(Boolean).join(", "), ref: g.request.number, href: `/requests/${g.request.id}` })),
    ...claims.map((c) => ({ id: `c-${c.id}`, name: c.stockItem.name, quantity: c.quantity, date: c.decidedAt ?? c.createdAt, detail: `Collected at ${c.event.name} (QR desk)`, ref: c.event.code, href: `/events/${c.event.id}` })),
    ...orders.filter((o) => o.status === "COLLECTED").flatMap((o) => o.lines.map((l) => ({ id: `o-${l.id}`, name: l.name, quantity: l.quantity, date: o.collectedAt ?? o.updatedAt, detail: `Points store, ${l.pointsCost * l.quantity} points`, ref: o.number, href: "/redemptions?view=collected" }))),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())
  return { emp, orders, awards, rewards, history: history.map((h) => ({ ...h, actor: actors.get(h.actorId) ?? "System" })), attended, goodies, rank: rank + 1, milestones }
}
export type EmployeeOverview = NonNullable<Awaited<ReturnType<typeof employeeOverview>>>

/**
 * Goodies each employee has actually received: store orders collected, goodie prizes issued,
 * goodies collected at events (QR desk) and milestone rewards issued. Units, by employee id.
 */
export async function goodiesReceived(employeeIds: string[]) {
  if (!employeeIds.length) return new Map<string, { units: number; items: string }>()
  const rows = await prisma.$queryRaw<{ employeeId: string; units: number; items: string | null }[]>`
    WITH g AS (
      SELECT o."employeeId", l.quantity AS q, l.name AS item FROM "RedemptionLine" l JOIN "RedemptionOrder" o ON o.id = l."orderId"
        WHERE o.status = 'COLLECTED' AND o."employeeId" = ANY(${employeeIds})
      UNION ALL
      SELECT a."employeeId", a.quantity, s.name FROM "EventAward" a JOIN "StockItem" s ON s.id = a."stockItemId"
        WHERE a.kind = 'GOODIE' AND a.status = 'ISSUED' AND a."employeeId" = ANY(${employeeIds})
      UNION ALL
      SELECT c."employeeId", c.quantity, s.name FROM "EventClaim" c JOIN "StockItem" s ON s.id = c."stockItemId"
        WHERE c.status = 'HANDED' AND c."employeeId" = ANY(${employeeIds})
      UNION ALL
      SELECT r."employeeId", 1, coalesce(s.name, 'Milestone goodie') FROM "RewardEarned" r
        LEFT JOIN "DistributionLine" d ON d."rewardId" = r.id LEFT JOIN "StockItem" s ON s.id = d."stockItemId"
        WHERE r.status = 'ISSUED' AND r."employeeId" = ANY(${employeeIds})
    )
    SELECT "employeeId", sum(q)::int AS units, string_agg(item || CASE WHEN q > 1 THEN ' x' || q ELSE '' END, '; ') AS items
    FROM g GROUP BY "employeeId"`
  return new Map(rows.map((r) => [r.employeeId, { units: r.units, items: r.items ?? "" }]))
}
