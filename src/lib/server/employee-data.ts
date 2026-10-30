import "server-only"
import { prisma } from "@/lib/db"

/** Everything shown on an employee's profile (staff view) or their own portal. */
export async function employeeOverview(id: string) {
  const emp = await prisma.employee.findUnique({ where: { id }, include: { user: { select: { email: true, active: true } } } })
  if (!emp) return null
  const [awards, rewards, history, attended, goodies, rank, milestones] = await Promise.all([
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
  return { emp, awards, rewards, history: history.map((h) => ({ ...h, actor: actors.get(h.actorId) ?? "System" })), attended, goodies, rank: rank + 1, milestones }
}
export type EmployeeOverview = NonNullable<Awaited<ReturnType<typeof employeeOverview>>>
