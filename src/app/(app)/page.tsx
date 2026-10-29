import Link from "next/link"
import {
  AlertTriangleIcon,
  ArrowDownToLineIcon,
  BoxesIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  FileClockIcon,
  GiftIcon,
  HourglassIcon,
  PackageOpenIcon,
  PackageXIcon,
  SettingsIcon,
  TrophyIcon,
} from "lucide-react"
import { startOfWeek, subDays, subWeeks, format } from "date-fns"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { leaderboard } from "@/lib/server/leaderboard"
import { requireUser } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { isOverdue } from "@/lib/server/workflow"
import { cn, fmtDate, fmtDateTime, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Panel, PanelHeader } from "@/components/app/page-header"
import { StockGauge } from "@/components/app/stock-gauge"
import { SizeRun, type SizeCell } from "@/components/app/size-run"
import { WeeklyChart } from "@/components/app/charts"
import { typeLabel } from "@/components/app/status-badge"
import { Sparkline } from "@/components/app/sparkline"
import { CategoryBadge } from "@/components/app/rewards-display"
import { WelcomeBand } from "@/components/app/welcome-band"

type Attention = { key: string; icon: React.ElementType; tone: "warn" | "danger" | "info" | "reward"; title: string; detail: string; href: string; action: string }

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser()
  const { denied } = await searchParams
  const settings = await getSettings()
  const since30 = subDays(new Date(), 30)
  const weeksBack = 12
  const weekStart = startOfWeek(subWeeks(new Date(), weeksBack - 1), { weekStartsOn: 1 })
  const approver = can(user.role, "request:approve")
  const exec = user.role === "EXECUTIVE"

  const [items, out30, pending, weekly, pointsWeekly, decisions, purposes, mine, flow, rewardsDue, upcoming, toRecord, top] = await Promise.all([
    prisma.stockItem.findMany({ where: { status: "ACTIVE" }, include: { category: true } }),
    prisma.distributionLine.aggregate({ where: { request: { status: "APPROVED" }, distributedOn: { gte: since30 } }, _sum: { quantity: true }, _count: true }),
    prisma.request.findMany({ where: { status: "SUBMITTED" }, select: { id: true, submittedAt: true, totalQty: true, createdById: true } }),
    prisma.$queryRaw<{ week: Date; units: number }[]>`
      SELECT date_trunc('week', l."distributedOn") AS week, SUM(l.quantity)::int AS units
      FROM "DistributionLine" l JOIN "Request" r ON r.id = l."requestId"
      WHERE r.status = 'APPROVED' AND l."distributedOn" >= ${weekStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ week: Date; pts: number }[]>`
      SELECT date_trunc('week', "createdAt") AS week, SUM(points)::int AS pts
      FROM "PointsTransaction" WHERE type = 'EVENT' AND "createdAt" >= ${weekStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.approvalEvent.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { actor: true, request: true } }),
    prisma.distributionLine.groupBy({
      by: ["purpose"],
      where: { request: { status: "APPROVED" }, distributedOn: { gte: subDays(new Date(), 120) } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 6,
    }),
    prisma.request.groupBy({ by: ["status"], where: { createdById: user.id, status: { in: ["DRAFT", "REJECTED"] } }, _count: true }),
    // Units reserved by distributions in review, and units inbound on stock inward in review.
    prisma.$queryRaw<{ reserved: number; inbound: number }[]>`
      SELECT
        (SELECT coalesce(sum(l.quantity), 0)::int FROM "DistributionLine" l JOIN "Request" r ON r.id = l."requestId" WHERE r.status = 'SUBMITTED') AS reserved,
        (SELECT coalesce(sum(l.quantity), 0)::int FROM "ReceiptLine" l JOIN "Request" r ON r.id = l."requestId" WHERE r.status = 'SUBMITTED') AS inbound`,
    can(user.role, "rewards:view") ? prisma.rewardEarned.count({ where: { status: "DUE" } }) : 0,
    prisma.event.findMany({ where: { status: "PLANNED", date: { gte: subDays(new Date(), 1) } }, include: { eventType: true }, orderBy: { date: "asc" }, take: 3 }),
    can(user.role, "rewards:operate") ? prisma.event.count({ where: { status: "PLANNED", date: { lt: subDays(new Date(), 1) } } }) : 0,
    leaderboard("quarter", { take: 5 }),
  ])

  const onHand = items.reduce((s, i) => s + i.availableQty, 0)
  const low = items.filter((i) => i.availableQty > 0 && i.availableQty <= i.reorderLevel)
  const out = items.filter((i) => i.availableQty <= 0)
  const restock = [...out, ...low].sort((a, b) => a.availableQty - b.availableQty).slice(0, 6)
  const waitingForMe = approver ? pending.filter((p) => p.createdById !== user.id) : []
  const overdue = waitingForMe.filter((p) => isOverdue(p.submittedAt, settings.escalationHours)).length
  const drafts = mine.find((m) => m.status === "DRAFT")?._count ?? 0
  const rejected = mine.find((m) => m.status === "REJECTED")?._count ?? 0
  const { reserved, inbound } = flow[0]

  const fill = <T,>(rows: T[], get: (r: T) => [Date, number]) => {
    const map = new Map(rows.map((r) => get(r)).map(([d, v]) => [format(new Date(d), "yyyy-MM-dd"), v]))
    return Array.from({ length: weeksBack }, (_, i) => {
      const d = startOfWeek(subWeeks(new Date(), weeksBack - 1 - i), { weekStartsOn: 1 })
      return { week: format(d, "d MMM"), v: map.get(format(d, "yyyy-MM-dd")) ?? 0 }
    })
  }
  const chart = fill(weekly, (w) => [w.week, Number(w.units)]).map((x) => ({ week: x.week, units: x.v }))
  const ptsSeries = fill(pointsWeekly, (w) => [w.week, Number(w.pts)]).map((x) => x.v)
  const pts30 = ptsSeries.slice(-4).reduce((s, v) => s + v, 0)

  // Worklist: what this person should act on, most urgent first.
  const attention: Attention[] = []
  if (overdue) attention.push({ key: "overdue", icon: CircleAlertIcon, tone: "danger", title: `${overdue} overdue approval${overdue > 1 ? "s" : ""}`, detail: `Waiting more than ${settings.escalationHours} hours`, href: "/approvals", action: "Review" })
  if (waitingForMe.length) attention.push({ key: "approvals", icon: ClipboardCheckIcon, tone: "warn", title: `${waitingForMe.length} request${waitingForMe.length > 1 ? "s" : ""} to approve`, detail: `${fmtNum(waitingForMe.reduce((s, p) => s + p.totalQty, 0))} units in review`, href: "/approvals", action: "Open queue" })
  if (rejected) attention.push({ key: "rejected", icon: FileClockIcon, tone: "danger", title: `${rejected} request${rejected > 1 ? "s" : ""} sent back to you`, detail: "Read the remarks, fix and resubmit", href: "/requests?status=REJECTED", action: "Fix" })
  if (drafts && can(user.role, "request:create")) attention.push({ key: "drafts", icon: FileClockIcon, tone: "info", title: `${drafts} draft${drafts > 1 ? "s" : ""} not submitted`, detail: "Stock doesn't move until approved", href: "/requests?status=DRAFT", action: "Continue" })
  if (out.length && (exec || user.role === "ADMIN")) attention.push({ key: "out", icon: PackageXIcon, tone: "danger", title: `${out.length} item${out.length > 1 ? "s" : ""} out of stock`, detail: out.slice(0, 2).map((i) => i.name).join(", "), href: "/stock?state=out", action: "See items" })
  if (low.length && (exec || user.role === "ADMIN")) attention.push({ key: "low", icon: AlertTriangleIcon, tone: "warn", title: `${low.length} item${low.length > 1 ? "s" : ""} running low`, detail: "At or below reorder level", href: "/stock?state=low", action: "Plan inward" })
  if (rewardsDue && can(user.role, "rewards:operate")) attention.push({ key: "rewards", icon: GiftIcon, tone: "reward", title: `${rewardsDue} points reward${rewardsDue > 1 ? "s" : ""} due`, detail: "Employees crossed a milestone", href: "/rewards", action: "Hand out" })
  if (toRecord) attention.push({ key: "record", icon: CalendarClockIcon, tone: "info", title: `${toRecord} past event${toRecord > 1 ? "s" : ""} without attendance`, detail: "Mark attendees so they get their points", href: "/events?view=upcoming", action: "Record" })

  const actions =
    exec ? (
      <>
        <Button asChild className="bg-white text-shell hover:bg-white/90">
          <Link href="/distributions/new"><PackageOpenIcon data-icon="inline-start" />Record a distribution</Link>
        </Button>
        <Button asChild variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white">
          <Link href="/events"><CalendarPlusIcon data-icon="inline-start" />Events and attendance</Link>
        </Button>
      </>
    ) : approver ? (
      <Button asChild className="bg-white text-shell hover:bg-white/90">
        <Link href="/approvals"><ClipboardCheckIcon data-icon="inline-start" />Review approvals{waitingForMe.length ? ` (${waitingForMe.length})` : ""}</Link>
      </Button>
    ) : user.role === "ADMIN" ? (
      <>
        <Button asChild className="bg-white text-shell hover:bg-white/90">
          <Link href="/admin/rewards"><SettingsIcon data-icon="inline-start" />Points and rewards rules</Link>
        </Button>
        <Button asChild variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white">
          <Link href="/admin/users">Users and roles</Link>
        </Button>
      </>
    ) : undefined

  const runs = (() => {
    const groups = new Map<string, SizeCell[]>()
    for (const i of items) {
      if (!["Apparel", "Welcome Kits"].includes(i.category.name) || !i.size) continue
      const key = `${i.product}${i.color ? ` (${i.color})` : ""}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push({ id: i.id, size: i.size, available: i.availableQty, total: i.openingQty + i.receivedQty, reorder: i.reorderLevel })
    }
    return [...groups.entries()].filter(([, c]) => c.length >= 3).sort((a, b) => b[1].length - a[1].length)
  })()
  const purposeMax = Math.max(1, ...purposes.map((p) => p._sum.quantity ?? 0))
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date())
  const summary = attention.length ? `${today}. ${attention.length} thing${attention.length > 1 ? "s" : ""} need${attention.length > 1 ? "" : "s"} your attention.` : `${today}. You're all caught up.`

  return (
    <>
      <WelcomeBand name={user.name} line={summary}>{actions}</WelcomeBand>

      {denied && (
        <Alert className="mb-5">
          <AlertTriangleIcon />
          <AlertTitle>That page isn&apos;t available for your role</AlertTitle>
          <AlertDescription>Ask an administrator if you need access.</AlertDescription>
        </Alert>
      )}

      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Home</h1>
          <p className="text-sm text-muted-foreground">Stock figures change only when a request gets final approval.</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="On hand" value={fmtNum(onHand)} hint={`${items.length} active items`} href="/stock" icon={<BoxesIcon />} />
        <Tile label="Reserved" value={fmtNum(reserved)} hint="In distributions under review" href="/requests?status=SUBMITTED" icon={<HourglassIcon />} />
        <Tile label="Free to promise" value={fmtNum(Math.max(0, onHand - reserved))} hint={inbound ? `${fmtNum(inbound)} more inbound` : "On hand minus reserved"} icon={<ArrowDownToLineIcon />} />
        <Tile label="Handed out, 30 days" value={fmtNum(out30._sum.quantity ?? 0)} hint={`${fmtNum(out30._count)} handovers`} spark={chart.map((c) => c.units)} href="/movements" />
        <Tile label="Low or out" value={fmtNum(low.length + out.length)} hint={`${out.length} out of stock`} tone={out.length ? "danger" : low.length ? "warn" : undefined} href="/stock?state=low" />
        <Tile label="Event points, 4 weeks" value={fmtNum(pts30)} hint={`${fmtNum(rewardsDue)} rewards due`} spark={ptsSeries} sparkTone="text-reward" href={can(user.role, "rewards:view") ? "/rewards" : undefined} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Needs your attention" description={attention.length ? "Most urgent first" : undefined} />
          {attention.length ? (
            <ul className="divide-y">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="group flex items-center gap-3 px-5 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4", a.tone === "danger" ? "bg-rejected-soft text-rejected" : a.tone === "warn" ? "bg-pending-soft text-pending" : a.tone === "reward" ? "bg-reward-soft text-reward" : "bg-accent text-primary")}>
                      <a.icon />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{a.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{a.detail}</span>
                    </span>
                    <span className="hidden items-center gap-1 text-sm font-medium text-primary sm:flex">{a.action}<ChevronRightIcon className="size-4 transition group-hover:translate-x-0.5" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing needs you right now.</p>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Engagement" description="Next events and top 5 this quarter" actions={<Button variant="ghost" size="sm" asChild><Link href="/leaderboard">Leaderboard</Link></Button>} />
          <div className="grid gap-0 divide-y">
            <ul className="divide-y">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/50">
                    <span className="flex w-10 shrink-0 flex-col items-center rounded-md border bg-card py-0.5 leading-none">
                      <span className="text-[10px] text-muted-foreground uppercase">{format(e.date, "MMM")}</span>
                      <span className="num text-base font-semibold">{format(e.date, "d")}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{e.name}</span>
                      <span className="text-xs text-muted-foreground">{e.location}</span>
                    </span>
                    <CategoryBadge category={e.eventType.category} />
                  </Link>
                </li>
              ))}
              {!upcoming.length && <li className="px-5 py-3 text-sm text-muted-foreground">No upcoming events.</li>}
            </ul>
            <ol className="px-5 py-3">
              {top.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold", i === 0 ? "bg-reward text-white" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                  <Link href={`/employees/${r.id}`} className="flex-1 truncate hover:text-primary">{r.name}</Link>
                  <span className="num text-muted-foreground">{fmtNum(r.score)} pts</span>
                </li>
              ))}
              {!top.length && <li className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><TrophyIcon className="size-4" />No event points in the last 90 days.</li>}
            </ol>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Units handed out per week" description="Approved distributions, last 12 weeks" />
          <div className="px-3 py-4">
            <WeeklyChart data={chart} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Where stock went" description="Units by purpose, last 120 days" />
          <ul className="flex flex-col gap-3 px-5 py-4">
            {purposes.map((p) => (
              <li key={p.purpose ?? "none"} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{p.purpose ?? "Not specified"}</span>
                  <span className="num font-medium">{fmtNum(p._sum.quantity ?? 0)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-2" style={{ width: `${((p._sum.quantity ?? 0) / purposeMax) * 100}%` }} />
                </div>
              </li>
            ))}
            {!purposes.length && <li className="text-sm text-muted-foreground">No approved distributions yet.</li>}
          </ul>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Needs restocking"
            description="Out of stock or at the reorder level"
            actions={exec ? <Button variant="outline" size="sm" asChild><Link href="/receipts/new"><ArrowDownToLineIcon data-icon="inline-start" />Record stock inward</Link></Button> : undefined}
          />
          <ul className="divide-y">
            {restock.map((i) => (
              <li key={i.id}>
                <Link href={`/stock/${i.id}`} className="flex items-center gap-4 px-5 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{i.code}, reorder at {i.reorderLevel}</span>
                  </div>
                  <StockGauge available={i.availableQty} total={i.openingQty + i.receivedQty} reorder={i.reorderLevel} className="w-40 sm:w-48" />
                </Link>
              </li>
            ))}
            {!restock.length && <li className="px-5 py-6 text-sm text-muted-foreground">Every item is above its reorder level.</li>}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Recent decisions" description="Submissions, approvals and rejections" actions={can(user.role, "audit:view") ? <Button variant="ghost" size="sm" asChild><Link href="/admin/audit">Audit log</Link></Button> : undefined} />
          <ol className="divide-y">
            {decisions.map((e) => (
              <li key={e.id}>
                <Link href={`/requests/${e.requestId}`} className="flex items-start gap-3 px-5 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", e.action === "APPROVED" ? "bg-approved" : e.action === "REJECTED" ? "bg-rejected" : e.action === "CANCELLED" ? "bg-muted-foreground" : "bg-pending")} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm">
                      <span className="font-medium">{e.actor.name}</span> {verb(e.action)} <span className="font-medium">{e.request.number}</span>
                      {e.level > 0 && <span className="text-muted-foreground"> (level {e.level})</span>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{typeLabel(e.request.type)}: {e.request.title}</span>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</time>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {runs.length > 0 && (
        <Panel className="mt-5">
          <PanelHeader title="Size runs" description="What's left of each size, so you can plan the next onboarding batch." actions={<Button variant="ghost" size="sm" asChild><Link href="/stock?category=Apparel">All apparel</Link></Button>} />
          <div className="grid gap-x-8 gap-y-6 px-5 py-5 md:grid-cols-2 2xl:grid-cols-3">
            {runs.map(([product, cells]) => (
              <SizeRun key={product} product={product} cells={cells} />
            ))}
          </div>
        </Panel>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">Updated {fmtDate(new Date())}, figures are live.</p>
    </>
  )
}

function verb(a: string) {
  return { SUBMITTED: "submitted", RESUBMITTED: "resubmitted", APPROVED: "approved", REJECTED: "rejected", CANCELLED: "deleted draft" }[a] ?? a.toLowerCase()
}

function Tile({ label, value, hint, tone, href, icon, spark, sparkTone }: { label: string; value: string; hint: string; tone?: "warn" | "danger"; href?: string; icon?: React.ReactNode; spark?: number[]; sparkTone?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <span className={cn("num font-heading text-[26px] leading-none font-semibold", tone === "danger" ? "text-rejected" : tone === "warn" ? "text-pending" : "")}>{value}</span>
      {spark ? <Sparkline values={spark} className={sparkTone} label={`${label} trend, 12 weeks`} /> : <span className="h-8" />}
      <span className="truncate text-xs text-muted-foreground">{hint}</span>
    </>
  )
  const cls = "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4"
  return href ? (
    <Link href={href} className={cn(cls, "outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
