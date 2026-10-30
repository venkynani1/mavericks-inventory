import "server-only"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import type { SessionUser } from "./session"
import { getSettings } from "./settings"

export type Notice = { id: string; tone: "info" | "warn" | "danger" | "success"; title: string; detail: string; href: string; at?: string }

/** What needs this person's attention right now, worked out from live data (nothing to mark as read). */
export async function noticesFor(user: SessionUser): Promise<Notice[]> {
  const out: Notice[] = []
  if (user.role === "EMPLOYEE") {
    const emp = await prisma.employee.findFirst({ where: { user: { id: user.id } }, select: { id: true } })
    if (!emp) return out
    const prizes = await prisma.eventAward.count({ where: { employeeId: emp.id, status: { in: ["PENDING", "IN_APPROVAL"] } } })
    if (prizes) out.push({ id: "prizes", tone: "success", title: `${prizes} prize${prizes > 1 ? "s" : ""} on the way`, detail: "Congratulations on your win!", href: "/me/goodies" })
    const [due, inProg, recent] = await Promise.all([
      prisma.rewardEarned.count({ where: { employeeId: emp.id, status: "DUE" } }),
      prisma.rewardEarned.count({ where: { employeeId: emp.id, status: "IN_PROGRESS" } }),
      prisma.pointsTransaction.findFirst({ where: { employeeId: emp.id }, orderBy: { createdAt: "desc" }, include: { event: true } }),
    ])
    if (due) out.push({ id: "due", tone: "success", title: `${due} reward${due > 1 ? "s" : ""} earned`, detail: "The engagement team will arrange your goodies.", href: "/me/goodies" })
    if (inProg) out.push({ id: "prog", tone: "info", title: "Goodies on the way", detail: `${inProg} reward${inProg > 1 ? "s are" : " is"} being handed out.`, href: "/me/goodies" })
    if (recent) out.push({ id: "recent", tone: "info", title: `${recent.points >= 0 ? "+" : ""}${recent.points} points`, detail: recent.event ? recent.event.name : (recent.reason ?? "Points updated"), href: "/me/history", at: recent.createdAt.toISOString() })
    return out
  }
  const settings = await getSettings()
  const overdueBefore = new Date(Date.now() - settings.escalationHours * 3600_000)
  const [toApprove, overdue, mineRejected, mineDraft, low, out0, rewardsDue, prizesDue] = await Promise.all([
    can(user.role, "request:approve") ? prisma.request.count({ where: { status: "SUBMITTED", createdById: { not: user.id } } }) : 0,
    can(user.role, "request:approve") ? prisma.request.count({ where: { status: "SUBMITTED", submittedAt: { lt: overdueBefore } } }) : 0,
    prisma.request.count({ where: { createdById: user.id, status: "REJECTED" } }),
    prisma.request.count({ where: { createdById: user.id, status: "DRAFT" } }),
    can(user.role, "stock:write") || user.role === "ADMIN" ? prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "StockItem" WHERE status = 'ACTIVE' AND "availableQty" > 0 AND "availableQty" <= "reorderLevel"` : [{ n: BigInt(0) }],
    can(user.role, "stock:write") || user.role === "ADMIN" ? prisma.stockItem.count({ where: { status: "ACTIVE", availableQty: { lte: 0 } } }) : 0,
    can(user.role, "rewards:operate") ? prisma.rewardEarned.count({ where: { status: "DUE" } }) : 0,
    can(user.role, "rewards:operate") ? prisma.eventAward.count({ where: { status: "PENDING" } }) : 0,
  ])
  if (toApprove) out.push({ id: "approve", tone: "warn", title: `${toApprove} request${toApprove > 1 ? "s" : ""} waiting for you`, detail: "Review and approve or reject.", href: "/approvals" })
  if (overdue) out.push({ id: "overdue", tone: "danger", title: `${overdue} overdue`, detail: `Waiting longer than ${settings.escalationHours} hours.`, href: "/approvals" })
  if (mineRejected) out.push({ id: "rej", tone: "danger", title: `${mineRejected} of your requests sent back`, detail: "Read the remarks, fix and resubmit.", href: "/requests?status=REJECTED" })
  if (mineDraft) out.push({ id: "draft", tone: "info", title: `${mineDraft} draft${mineDraft > 1 ? "s" : ""} not submitted`, detail: "Drafts don't move stock until approved.", href: "/requests?status=DRAFT" })
  const lowN = Number(low[0]?.n ?? 0)
  if (out0) out.push({ id: "out", tone: "danger", title: `${out0} item${out0 > 1 ? "s" : ""} out of stock`, detail: "Plan a stock inward.", href: "/stock?state=out" })
  if (lowN) out.push({ id: "low", tone: "warn", title: `${lowN} item${lowN > 1 ? "s" : ""} at or below reorder level`, detail: "Check the reorder suggestions.", href: "/stock?state=low" })
  if (rewardsDue) out.push({ id: "rewards", tone: "success", title: `${rewardsDue} points reward${rewardsDue > 1 ? "s" : ""} due`, detail: "Employees crossed a milestone. Hand out their goodies.", href: "/rewards" })
  if (prizesDue) out.push({ id: "prizes", tone: "success", title: `${prizesDue} event prize${prizesDue > 1 ? "s" : ""} to hand out`, detail: "Winners' vouchers and goodies are waiting.", href: "/prizes" })
  return out
}
