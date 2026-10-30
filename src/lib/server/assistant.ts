import "server-only"
import { prisma } from "@/lib/db"
import { progressOf } from "@/lib/points"
import { can, ROLE_LABEL, type Role } from "@/lib/roles"
import { fmtDate, fmtNum } from "@/lib/utils"
import type { SessionUser } from "./session"
import { getSettings } from "./settings"

/*
 * "Ask Mav" answers questions about this application's data, and only within what the person
 * asking is allowed to see. Scope is enforced here, on the server, in two ways:
 *   1. each tool declares which roles may call it, and the tool list offered for a question is
 *      filtered by the signed-in person's role;
 *   2. every tool re-checks scope when it runs (an employee's "points" tool only ever reads
 *      their own record, whatever name is typed).
 * With ANTHROPIC_API_KEY set, Claude chooses the tools and writes the answer. Without it, a
 * built-in keyword engine calls the same tools, so the assistant works with no setup at all.
 */

export type Link = { label: string; href: string }
export type ToolOut = { text: string; links?: Link[] }
type Ctx = { user: SessionUser; employeeId: string | null }
type Tool = {
  name: string
  description: string
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] }
  allowed: (role: Role) => boolean
  run: (input: Record<string, unknown>, ctx: Ctx) => Promise<ToolOut>
}

const staff = (r: Role) => r !== "EMPLOYEE"
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

async function reservedFor(ids: string[]) {
  if (!ids.length) return new Map<string, number>()
  const rows = await prisma.distributionLine.groupBy({ by: ["stockItemId"], where: { stockItemId: { in: ids }, request: { status: "SUBMITTED" } }, _sum: { quantity: true } })
  return new Map(rows.map((r) => [r.stockItemId, r._sum.quantity ?? 0]))
}

async function employeeFor(ctx: Ctx, query: string) {
  // Employees can only ever see themselves.
  if (ctx.user.role === "EMPLOYEE") return ctx.employeeId ? prisma.employee.findUnique({ where: { id: ctx.employeeId } }) : null
  if (!query) return ctx.employeeId ? prisma.employee.findUnique({ where: { id: ctx.employeeId } }) : null
  return prisma.employee.findFirst({
    where: { OR: [{ empId: query }, { name: { contains: query, mode: "insensitive" } }, { email: { equals: query, mode: "insensitive" } }] },
    orderBy: { points: "desc" },
  })
}

const TOOLS: Tool[] = [
  {
    name: "search_stock",
    description: "Look up stock items by name, product, size, colour or stock code. Returns on-hand, reserved (in requests waiting for approval) and available-to-promise quantities.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Words to search for, e.g. 'black t-shirt XL' or 'MAV-0012'" } }, required: ["query"] },
    allowed: (r) => can(r, "inventory:view"),
    async run(input) {
      const words = str(input.query).split(/\s+/).filter((w) => w.length > 1 && !/^(how|many|much|do|we|have|stock|of|the|is|are|left|available|in|any)$/i.test(w))
      if (!words.length) return { text: "Tell me which item to look up, for example \"black t-shirt XL\"." }
      const items = await prisma.stockItem.findMany({
        where: { status: "ACTIVE", AND: words.map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { code: { contains: w, mode: "insensitive" as const } }, { product: { contains: w, mode: "insensitive" as const } }] })) },
        orderBy: { availableQty: "desc" },
        take: 8,
      })
      if (!items.length) return { text: `No active stock item matches "${words.join(" ")}".`, links: [{ label: "Browse all items", href: "/stock" }] }
      const res = await reservedFor(items.map((i) => i.id))
      const lines = items.map((i) => {
        const r = res.get(i.id) ?? 0
        return `- **${i.name}** (${i.code}): ${fmtNum(i.availableQty)} on hand${r ? `, ${fmtNum(r)} reserved, ${fmtNum(i.availableQty - r)} free to promise` : ""}${i.availableQty <= 0 ? " (out of stock)" : i.availableQty <= i.reorderLevel ? " (low)" : ""}`
      })
      return { text: `${items.length === 8 ? "Top matches" : "Matches"}:\n${lines.join("\n")}`, links: items.slice(0, 3).map((i) => ({ label: i.code, href: `/stock/${i.id}` })) }
    },
  },
  {
    name: "low_stock",
    description: "Items that are out of stock or at/below their reorder level, with how much is needed to get back to the reorder level.",
    input_schema: { type: "object", properties: {} },
    allowed: (r) => can(r, "inventory:view"),
    async run() {
      const items = await prisma.$queryRaw<{ id: string; code: string; name: string; availableQty: number; reorderLevel: number }[]>`
        SELECT id, code, name, "availableQty", "reorderLevel" FROM "StockItem" WHERE status = 'ACTIVE' AND "availableQty" <= "reorderLevel" ORDER BY "availableQty" ASC, name LIMIT 12`
      if (!items.length) return { text: "Nothing is at or below its reorder level right now." }
      return {
        text: `${items.length} item${items.length > 1 ? "s" : ""} need attention:\n${items.map((i) => `- **${i.name}** (${i.code}): ${fmtNum(i.availableQty)} left, reorder level ${fmtNum(i.reorderLevel)}`).join("\n")}`,
        links: [{ label: "Low stock list", href: "/stock?state=low" }, { label: "Record stock inward", href: "/receipts/new" }],
      }
    },
  },
  {
    name: "pending_approvals",
    description: "Requests waiting for approval. Approvers see what's waiting for them; executives see their own submitted requests.",
    input_schema: { type: "object", properties: {} },
    allowed: (r) => can(r, "inventory:view"),
    async run(_i, { user }) {
      const settings = await getSettings()
      const approver = can(user.role, "request:approve")
      const where = approver ? { status: "SUBMITTED" as const, createdById: { not: user.id } } : { status: "SUBMITTED" as const, createdById: user.id }
      const reqs = await prisma.request.findMany({ where, orderBy: { submittedAt: "asc" }, take: 10, include: { createdBy: { select: { name: true } } } })
      if (!reqs.length) return { text: approver ? "Nothing is waiting for your approval." : "None of your requests are waiting for approval." }
      const hrs = (d: Date | null) => (d ? Math.round((Date.now() - d.getTime()) / 3600_000) : 0)
      return {
        text: `${reqs.length} waiting${approver ? " for you" : ""}:\n${reqs.map((r) => `- **${r.number}** ${r.title}: ${fmtNum(r.totalQty)} units, by ${r.createdBy.name}, ${hrs(r.submittedAt)}h ago${hrs(r.submittedAt) > settings.escalationHours ? " (overdue)" : ""}`).join("\n")}`,
        links: approver ? [{ label: "Open approvals", href: "/approvals" }] : [{ label: "My requests", href: "/requests" }],
      }
    },
  },
  {
    name: "my_requests",
    description: "The signed-in person's own requests (drafts, submitted, sent back, approved), newest first.",
    input_schema: { type: "object", properties: { status: { type: "string", enum: ["DRAFT", "SUBMITTED", "REJECTED", "APPROVED"] } } },
    allowed: (r) => can(r, "request:create"),
    async run(input, { user }) {
      const status = ["DRAFT", "SUBMITTED", "REJECTED", "APPROVED"].includes(str(input.status)) ? (str(input.status) as "DRAFT") : undefined
      const reqs = await prisma.request.findMany({ where: { createdById: user.id, status: status ?? { not: "CANCELLED" } }, orderBy: { updatedAt: "desc" }, take: 8 })
      if (!reqs.length) return { text: "You have no requests" + (status ? ` with status ${status.toLowerCase()}.` : ".") }
      return { text: reqs.map((r) => `- **${r.number}** ${r.title}: ${r.status.toLowerCase()}, ${fmtNum(r.totalQty)} units`).join("\n"), links: [{ label: "My requests", href: "/requests" }] }
    },
  },
  {
    name: "distribution_summary",
    description: "How many goodies were handed out in the last N days, the top items and the top purposes.",
    input_schema: { type: "object", properties: { days: { type: "number", description: "Look-back window in days (default 30)" } } },
    allowed: (r) => can(r, "report:view"),
    async run(input) {
      const days = Math.min(365, Math.max(1, Number(input.days) || 30))
      const since = new Date(Date.now() - days * 86400_000)
      const where = { request: { status: "APPROVED" as const }, distributedOn: { gte: since } }
      const [agg, byItem, byPurpose] = await Promise.all([
        prisma.distributionLine.aggregate({ where, _sum: { quantity: true }, _count: true }),
        prisma.distributionLine.groupBy({ by: ["stockItemId"], where, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
        prisma.distributionLine.groupBy({ by: ["purpose"], where, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 4 }),
      ])
      const names = new Map((await prisma.stockItem.findMany({ where: { id: { in: byItem.map((b) => b.stockItemId) } }, select: { id: true, name: true } })).map((i) => [i.id, i.name]))
      return {
        text: `In the last ${days} days: **${fmtNum(agg._sum.quantity ?? 0)} units** across ${fmtNum(agg._count)} handovers.\nTop items:\n${byItem.map((b) => `- ${names.get(b.stockItemId)}: ${fmtNum(b._sum.quantity ?? 0)}`).join("\n")}\nTop purposes: ${byPurpose.map((p) => `${p.purpose ?? "Other"} (${fmtNum(p._sum.quantity ?? 0)})`).join(", ")}`,
        links: [{ label: "Distributed stock report", href: "/reports?r=distributed" }],
      }
    },
  },
  {
    name: "employee_points",
    description: "An employee's points balance, progress to the next milestone and rewards. Staff can look up anyone by name or employee ID; an employee only ever sees their own.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Employee name or ID. Leave empty for yourself." } } },
    allowed: () => true,
    async run(input, ctx) {
      if (ctx.user.role !== "EMPLOYEE" && !can(ctx.user.role, "rewards:view") && str(input.query)) return { text: "Your role can't look up other employees' points." }
      const emp = await employeeFor(ctx, str(input.query))
      if (!emp) return { text: ctx.user.role === "EMPLOYEE" ? "Your account isn't linked to an employee record yet. Ask the engagement team." : `I couldn't find an employee matching "${str(input.query)}".` }
      const settings = await getSettings()
      const p = progressOf(emp.points, settings.rewards)
      const rewards = await prisma.rewardEarned.findMany({ where: { employeeId: emp.id }, orderBy: [{ cycle: "desc" }, { threshold: "asc" }] })
      const self = emp.id === ctx.employeeId
      const who = self ? "You have" : `**${emp.name}** (${emp.empId}) has`
      const next = p.complete ? `All ${p.total} milestones reached.` : `${fmtNum(p.toNext)} more points to the ${fmtNum(p.next!)} milestone.`
      const rw = rewards.length ? `\nRewards: ${rewards.map((r) => `${fmtNum(r.threshold)} ${r.status === "ISSUED" ? "received" : r.status === "IN_PROGRESS" ? "on the way" : r.status === "DUE" ? "due" : "cancelled"}`).join(", ")}` : ""
      return { text: `${who} **${fmtNum(emp.points)} points** (cycle ${emp.cycle}, lifetime ${fmtNum(emp.lifetimePoints)}). ${next}${rw}`, links: [{ label: self && ctx.user.role === "EMPLOYEE" ? "My dashboard" : emp.name, href: self && ctx.user.role === "EMPLOYEE" ? "/me" : `/employees/${emp.id}` }] }
    },
  },
  {
    name: "my_goodies",
    description: "Goodies the signed-in employee has received, with dates, and rewards still on the way.",
    input_schema: { type: "object", properties: {} },
    allowed: () => true,
    async run(_i, ctx) {
      const emp = ctx.employeeId ? await prisma.employee.findUnique({ where: { id: ctx.employeeId } }) : null
      if (!emp) return { text: "Your account isn't linked to an employee record, so there are no goodies to show." }
      const lines = await prisma.distributionLine.findMany({ where: { recipientId: emp.empId, request: { status: "APPROVED" } }, include: { stockItem: true }, orderBy: { distributedOn: "desc" }, take: 12 })
      const pending = await prisma.rewardEarned.count({ where: { employeeId: emp.id, status: { in: ["DUE", "IN_PROGRESS"] } } })
      if (!lines.length) return { text: `No goodies recorded yet.${pending ? ` ${pending} reward${pending > 1 ? "s are" : " is"} on the way.` : ""}` }
      return { text: `You've received ${lines.length} goodie${lines.length > 1 ? "s" : ""}:\n${lines.map((l) => `- ${l.stockItem.name} x${l.quantity}, ${fmtDate(l.distributedOn)}${l.purpose ? ` (${l.purpose})` : ""}`).join("\n")}${pending ? `\n${pending} more reward${pending > 1 ? "s are" : " is"} on the way.` : ""}`, links: [{ label: "Goodies received", href: "/me/goodies" }] }
    },
  },
  {
    name: "events",
    description: "Upcoming events and recent events with the points each one gives. For employees, also marks which ones they attended.",
    input_schema: { type: "object", properties: { when: { type: "string", enum: ["upcoming", "recent"] } } },
    allowed: () => true,
    async run(input, ctx) {
      const upcoming = str(input.when) !== "recent"
      const evs = await prisma.event.findMany({
        where: upcoming ? { status: "PLANNED", date: { gte: new Date(Date.now() - 86400_000) } } : { status: "COMPLETED" },
        include: { eventType: true, _count: { select: { attendance: true } } },
        orderBy: { date: upcoming ? "asc" : "desc" },
        take: 8,
      })
      if (!evs.length) return { text: upcoming ? "No upcoming events are scheduled yet." : "No completed events yet." }
      const mine = ctx.employeeId ? new Set((await prisma.attendance.findMany({ where: { employeeId: ctx.employeeId, eventId: { in: evs.map((e) => e.id) } }, select: { eventId: true } })).map((a) => a.eventId)) : new Set<string>()
      return {
        text: `${upcoming ? "Coming up" : "Recent events"}:\n${evs.map((e) => `- **${e.name}** (${e.eventType.name}), ${fmtDate(e.date)}, ${e.location ?? ""}: ${fmtNum(e.points ?? e.eventType.points)} points${upcoming ? "" : `, ${e._count.attendance} attended`}${mine.has(e.id) ? " (you attended)" : ""}`).join("\n")}`,
        links: [{ label: "Events", href: ctx.user.role === "EMPLOYEE" ? "/me/events" : "/events" }],
      }
    },
  },
  {
    name: "rewards_due",
    description: "Points rewards that employees have earned but not yet received, grouped by milestone.",
    input_schema: { type: "object", properties: {} },
    allowed: (r) => can(r, "rewards:view"),
    async run() {
      const rows = await prisma.rewardEarned.groupBy({ by: ["threshold"], where: { status: "DUE" }, _count: true, orderBy: { threshold: "asc" } })
      const inProg = await prisma.rewardEarned.count({ where: { status: "IN_PROGRESS" } })
      if (!rows.length) return { text: `No rewards are waiting to be handed out.${inProg ? ` ${inProg} are on a distribution waiting for approval.` : ""}` }
      return { text: `${rows.reduce((s, r) => s + r._count, 0)} rewards due:\n${rows.map((r) => `- ${fmtNum(r.threshold)} milestone: ${r._count}`).join("\n")}${inProg ? `\n${inProg} more are on a distribution waiting for approval.` : ""}`, links: [{ label: "Rewards worklist", href: "/rewards" }] }
    },
  },
  {
    name: "leaderboard",
    description: "Top employees by current points.",
    input_schema: { type: "object", properties: { top: { type: "number" } } },
    allowed: () => true,
    async run(input, ctx) {
      if (ctx.user.role === "EMPLOYEE" && !(await getSettings()).leaderboardForEmployees) return { text: "The leaderboard isn't shared with employees." }
      const top = Math.min(20, Math.max(3, Number(input.top) || 10))
      const emps = await prisma.employee.findMany({ where: { active: true, points: { gt: 0 } }, orderBy: [{ points: "desc" }, { name: "asc" }], take: top })
      return { text: emps.map((e, i) => `${i + 1}. **${e.name}**${staff(ctx.user.role) ? ` (${e.empId})` : ""}: ${fmtNum(e.points)}${e.id === ctx.employeeId ? " (you)" : ""}`).join("\n"), links: staff(ctx.user.role) ? [{ label: "Leaderboard", href: "/leaderboard" }] : [] }
    },
  },
  {
    name: "how_to",
    description: "Step-by-step help for using this application (recording a distribution, uploading attendance, approving, adjusting points, and so on).",
    input_schema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
    allowed: () => true,
    async run(input, { user }) {
      const t = str(input.topic).toLowerCase()
      const pick = HOWTO.filter((h) => h.roles(user.role) && h.keys.some((k) => t.includes(k)))
      const list = pick.length ? pick : HOWTO.filter((h) => h.roles(user.role))
      if (!pick.length) return { text: `Here's what I can walk you through as ${ROLE_LABEL[user.role]}:\n${list.map((h) => `- ${h.title}`).join("\n")}` }
      return { text: pick.slice(0, 2).map((h) => `**${h.title}**\n${h.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`).join("\n\n"), links: pick.slice(0, 2).flatMap((h) => (h.href ? [{ label: h.title, href: h.href }] : [])) }
    },
  },
]

const HOWTO: { title: string; keys: string[]; roles: (r: Role) => boolean; steps: string[]; href?: string }[] = [
  { title: "Hand out goodies (distribution)", keys: ["distribut", "hand out", "give", "issue"], roles: (r) => can(r, "request:create"), href: "/distributions/new", steps: ["Open Distributions and choose New distribution (or Upload sheet for many rows).", "Add a line per person: item, quantity, employee ID, name, purpose.", "Save as draft, then Submit for approval. Stock leaves the shelf only when it's approved."] },
  { title: "Record stock inward", keys: ["inward", "receive", "receipt", "replenish", "new stock"], roles: (r) => can(r, "request:create"), href: "/receipts/new", steps: ["Open Stock inward and choose New stock inward.", "Pick the items and quantities received, with the supplier and invoice reference.", "Submit for approval; available stock goes up once approved."] },
  { title: "Record event attendance", keys: ["attendance", "event", "attend", "points for"], roles: (r) => can(r, "rewards:operate"), href: "/events", steps: ["Open Events and create the event (its type sets the points).", "Open the event and add attendees by employee ID, or upload the attendance sheet.", "Points are credited at once; anyone crossing a milestone appears in Rewards."] },
  { title: "Hand out points rewards", keys: ["reward", "milestone", "goodie", "2000"], roles: (r) => can(r, "rewards:operate"), href: "/rewards", steps: ["Open Rewards. Everyone who crossed a milestone is listed as Due.", "Select the people and choose Create distribution (the milestone's goodie is filled in).", "Submit it; when it's approved the rewards show as Issued and stock is reduced."] },
  { title: "Approve or reject requests", keys: ["approv", "reject"], roles: (r) => can(r, "request:approve"), href: "/approvals", steps: ["Open Approvals. Overdue requests are flagged.", "Open a request to see every line and any stock shortfall.", "Approve, or reject with a remark the maker will see."] },
  { title: "Change points per event type or milestone goodies", keys: ["points per", "configure", "event type", "milestone", "rule", "cap"], roles: (r) => can(r, "rewards:configure"), href: "/admin/rewards", steps: ["Open Administration, Points and rewards rules.", "Edit points for each event type, the milestone step and cap, and the goodie for each milestone.", "Changes apply to attendance recorded from now on; history isn't rewritten."] },
  { title: "Adjust or reset someone's points", keys: ["adjust", "reset", "correct"], roles: (r) => can(r, "rewards:configure"), href: "/employees", steps: ["Open Employees and points and find the person.", "Choose Adjust points (with a reason) or Reset points to start a new cycle.", "Every change is kept in their points history and the audit log."] },
  { title: "See your points and goodies", keys: ["my points", "my goodies", "progress"], roles: (r) => r === "EMPLOYEE", href: "/me", steps: ["Open My dashboard to see your points and the progress bar to the cap.", "Goodies received lists everything handed to you.", "Points history shows each event and adjustment."] },
]

/** Tools this person may use. */
export const toolsFor = (role: Role) => TOOLS.filter((t) => t.allowed(role))

export async function contextFor(user: SessionUser): Promise<Ctx> {
  const emp = await prisma.employee.findFirst({ where: { OR: [{ user: { id: user.id } }, { empId: user.empId }] }, select: { id: true } })
  return { user, employeeId: emp?.id ?? null }
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<ToolOut> {
  const tool = toolsFor(ctx.user.role).find((t) => t.name === name)
  if (!tool) return { text: "That information is outside what your role can see." }
  return tool.run(input ?? {}, ctx)
}

// ---------------- built-in engine (no API key needed) ----------------

const OFF_TOPIC = /\b(weather|cricket|movie|stock market|share price|bitcoin|recipe|politic|election|joke|poem|song|news)\b/i

export async function answerOffline(text: string, ctx: Ctx): Promise<ToolOut & { tool?: string }> {
  const t = text.toLowerCase().trim()
  const role = ctx.user.role
  const first = ctx.user.name.split(" ")[0]
  const call = async (name: string, input: Record<string, unknown> = {}) => ({ ...(await runTool(name, input, ctx)), tool: name })

  if (/^(hi|hello|hey|hai|good (morning|afternoon|evening))\b/.test(t) || t.length < 3)
    return { text: `Hi ${first}! I can answer questions about ${role === "EMPLOYEE" ? "your points, goodies and events" : "stock, requests, approvals, events, points and rewards"}. Try one of the suggestions below.` }
  if (OFF_TOPIC.test(t)) return { text: "I can only help with Mavericks Inventory: stock, requests, events, points and rewards, within what your role can see." }
  if (/how (do|can|to)|steps|help me|guide/.test(t)) return call("how_to", { topic: t })
  if (/leader|top (\d+ )?(employees|people|scorers)|rank/.test(t)) return call("leaderboard", { top: Number(t.match(/top (\d+)/)?.[1]) || 10 })
  if (/goodie|received|got|swag/.test(t) && (role === "EMPLOYEE" || /\bmy\b|\bi\b/.test(t))) return call("my_goodies")
  if (/point|milestone|progress|balance/.test(t)) {
    const named = text.match(/(?:of|for|does|did|has)\s+([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+)*|\d{6,})/)?.[1] ?? text.match(/\b(\d{8,})\b/)?.[1] ?? ""
    if (role === "EMPLOYEE") {
      const own = await call("employee_points", { query: "" })
      const asksOther = named && !ctx.user.name.toLowerCase().includes(named.toLowerCase()) && named !== ctx.user.empId
      return asksOther ? { ...own, text: `I can only show your own points, not anyone else's.\n${own.text}` } : own
    }
    if (/reward|due|pending|hand/.test(t) && can(role, "rewards:view") && !named) return call("rewards_due")
    return call("employee_points", { query: named.trim() })
  }
  if (/reward/.test(t) && can(role, "rewards:view")) return call("rewards_due")
  if (/event|hackathon|workshop|codeathon|webinar|talk/.test(t)) return call("events", { when: /recent|last|past|previous|completed/.test(t) ? "recent" : "upcoming" })
  if (role === "EMPLOYEE") return { text: `I can tell you about your points, goodies and events. For example: "How many points do I have?"` }
  if (/low|reorder|out of stock|running out|short/.test(t)) return call("low_stock")
  if (/approv|pending|waiting|overdue/.test(t)) return call("pending_approvals")
  if (/my (requests|drafts)|draft|rejected|sent back/.test(t) && can(role, "request:create")) return call("my_requests", { status: /draft/.test(t) ? "DRAFT" : /reject|sent back/.test(t) ? "REJECTED" : undefined })
  if (/distribut|handed|issued|given out|consum/.test(t) && can(role, "report:view")) return call("distribution_summary", { days: Number(t.match(/(\d+)\s*days?/)?.[1]) || (/week/.test(t) ? 7 : /quarter/.test(t) ? 90 : /year/.test(t) ? 365 : 30) })
  return call("search_stock", { query: text })
}

export function suggestionsFor(role: Role): string[] {
  if (role === "EMPLOYEE") return ["How many points do I have?", "What goodies have I received?", "Upcoming events", "Show the leaderboard"]
  const s: string[] = []
  if (can(role, "request:approve")) s.push("What's waiting for my approval?")
  if (can(role, "request:create")) s.push("Which items are running low?")
  s.push("How many black t-shirts do we have?")
  if (can(role, "rewards:view")) s.push("Rewards due")
  if (can(role, "report:view")) s.push("Distributions in the last 30 days")
  if (can(role, "rewards:operate")) s.push("How do I record event attendance?")
  if (can(role, "rewards:configure")) s.push("How do I change points per event type?")
  return s.slice(0, 5)
}

// ---------------- Claude (when ANTHROPIC_API_KEY is set) ----------------

type Msg = { role: "user" | "assistant"; content: unknown }

export async function answerWithClaude(history: { role: "user" | "assistant"; text: string }[], ctx: Ctx): Promise<ToolOut> {
  const key = process.env.ANTHROPIC_API_KEY!
  const model = process.env.ASSISTANT_MODEL || "claude-haiku-5-5"
  const tools = toolsFor(ctx.user.role)
  const system = [
    `You are "Mav", the assistant inside Mavericks Inventory, Hexaware's goodies stores and employee engagement application.`,
    `You are talking to ${ctx.user.name}, whose role is ${ROLE_LABEL[ctx.user.role]}. Today is ${fmtDate(new Date())}.`,
    `Only answer questions about this application and its data. Use the tools to get facts; never guess numbers. If a question is outside the application, or needs data the tools don't offer to this role, say briefly that it's outside what you can help with here.`,
    ctx.user.role === "EMPLOYEE" ? "This person is an employee: they may only see their own points, goodies and events, the public events list and (if allowed) the leaderboard. Never reveal other employees' details." : "",
    `Answer in short, plain sentences. Use "- " bullet lists for several items and **bold** for key numbers. Don't use headings or tables. Use Indian number formatting (1,00,000).`,
  ].filter(Boolean).join("\n")
  const messages: Msg[] = history.slice(-10).map((m) => ({ role: m.role, content: m.text }))
  const links: Link[] = []
  for (let turn = 0; turn < 5; turn++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 900, system, tools: tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })), messages }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) throw new Error(`Assistant API ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const data = (await r.json()) as { stop_reason: string; content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[] }
    if (data.stop_reason !== "tool_use") {
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()
      return { text: text || "I couldn't find an answer to that.", links: dedupe(links) }
    }
    messages.push({ role: "assistant", content: data.content })
    const results = []
    for (const b of data.content.filter((b) => b.type === "tool_use")) {
      const out = await runTool(b.name!, b.input ?? {}, ctx).catch(() => ({ text: "That lookup failed.", links: [] }))
      links.push(...(out.links ?? []))
      results.push({ type: "tool_result", tool_use_id: b.id, content: out.text })
    }
    messages.push({ role: "user", content: results })
  }
  return { text: "That took too many steps. Try asking a narrower question.", links: dedupe(links) }
}

const dedupe = (l: Link[]) => [...new Map(l.map((x) => [x.href, x])).values()].slice(0, 4)
