import Link from "next/link"
import { AlertTriangleIcon, ArrowDownToLineIcon, ClipboardCheckIcon, PackageOpenIcon, UploadIcon } from "lucide-react"
import { startOfWeek, subDays, subWeeks, format } from "date-fns"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { requireUser } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { isOverdue } from "@/lib/server/workflow"
import { fmtDateTime, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { StockGauge } from "@/components/app/stock-gauge"
import { SizeRun, type SizeCell } from "@/components/app/size-run"
import { WeeklyChart } from "@/components/app/charts"
import { typeLabel } from "@/components/app/status-badge"

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser()
  const { denied } = await searchParams
  const settings = await getSettings()
  const since30 = subDays(new Date(), 30)
  const weeksBack = 12
  const weekStart = startOfWeek(subWeeks(new Date(), weeksBack - 1), { weekStartsOn: 1 })

  const [items, out30, pending, weekly, events, purposes, myOpen] = await Promise.all([
    prisma.stockItem.findMany({ where: { status: "ACTIVE" }, include: { category: true } }),
    prisma.distributionLine.aggregate({ where: { request: { status: "APPROVED" }, distributedOn: { gte: since30 } }, _sum: { quantity: true }, _count: true }),
    prisma.request.findMany({ where: { status: "SUBMITTED" }, select: { id: true, submittedAt: true, totalQty: true, createdById: true } }),
    prisma.$queryRaw<{ week: Date; units: bigint }[]>`
      SELECT date_trunc('week', l."distributedOn") AS week, SUM(l.quantity) AS units
      FROM "DistributionLine" l JOIN "Request" r ON r.id = l."requestId"
      WHERE r.status = 'APPROVED' AND l."distributedOn" >= ${weekStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.approvalEvent.findMany({ orderBy: { createdAt: "desc" }, take: 7, include: { actor: true, request: true } }),
    prisma.distributionLine.groupBy({
      by: ["purpose"],
      where: { request: { status: "APPROVED" }, distributedOn: { gte: subDays(new Date(), 120) } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 6,
    }),
    prisma.request.count({ where: { createdById: user.id, status: { in: ["DRAFT", "REJECTED"] } } }),
  ])

  const onHand = items.reduce((s, i) => s + i.availableQty, 0)
  const attention = items
    .filter((i) => i.availableQty <= i.reorderLevel)
    .sort((a, b) => a.availableQty - b.availableQty)
    .slice(0, 6)
  const waitingForMe = can(user.role, "request:approve") ? pending.filter((p) => p.createdById !== user.id) : []
  const overdue = waitingForMe.filter((p) => isOverdue(p.submittedAt, settings.escalationHours)).length

  // Fill missing weeks so the chart reads as a continuous timeline.
  const map = new Map(weekly.map((w) => [format(new Date(w.week), "yyyy-MM-dd"), Number(w.units)]))
  const chart = Array.from({ length: weeksBack }, (_, i) => {
    const d = startOfWeek(subWeeks(new Date(), weeksBack - 1 - i), { weekStartsOn: 1 })
    return { week: format(d, "d MMM"), units: map.get(format(d, "yyyy-MM-dd")) ?? 0 }
  })

  // Size runs: apparel and kits grouped by product + colour, only when there are several sizes.
  const groups = new Map<string, SizeCell[]>()
  for (const i of items) {
    if (!["Apparel", "Welcome Kits"].includes(i.category.name) || !i.size) continue
    const key = `${i.product}${i.color ? ` · ${i.color}` : ""}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ id: i.id, size: i.size, available: i.availableQty, total: i.openingQty + i.receivedQty, reorder: i.reorderLevel })
  }
  const runs = [...groups.entries()].filter(([, c]) => c.length >= 3).sort((a, b) => b[1].length - a[1].length)
  const purposeMax = Math.max(1, ...purposes.map((p) => p._sum.quantity ?? 0))
  const firstName = user.name.split(" ")[0]

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        description={`${fmtNum(onHand)} units on hand across ${items.length} items. Figures update the moment a request gets final approval.`}
        actions={
          user.role === "EXECUTIVE" ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/distributions/upload">
                  <UploadIcon data-icon="inline-start" />
                  Upload distributions
                </Link>
              </Button>
              <Button asChild>
                <Link href="/distributions/new">
                  <PackageOpenIcon data-icon="inline-start" />
                  Record a distribution
                </Link>
              </Button>
            </>
          ) : can(user.role, "request:approve") ? (
            <Button asChild>
              <Link href="/approvals">
                <ClipboardCheckIcon data-icon="inline-start" />
                Review approvals
              </Link>
            </Button>
          ) : undefined
        }
      />

      {denied && (
        <Alert className="mb-6">
          <AlertTriangleIcon />
          <AlertTitle>That page isn&apos;t available for your role</AlertTitle>
          <AlertDescription>Ask an administrator if you need access.</AlertDescription>
        </Alert>
      )}

      {waitingForMe.length > 0 && (
        <Link href="/approvals" className="mb-6 flex items-center gap-3 rounded-xl border border-pending/30 bg-pending-soft px-4 py-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <ClipboardCheckIcon className="size-4 text-pending" />
          <span>
            <strong className="font-semibold">{waitingForMe.length} request{waitingForMe.length > 1 ? "s" : ""}</strong> waiting for your approval
            {overdue > 0 && <span className="text-pending"> — {overdue} older than {settings.escalationHours} hours</span>}
          </span>
          <span className="ml-auto font-medium text-pending">Open queue</span>
        </Link>
      )}
      {user.role === "EXECUTIVE" && myOpen > 0 && (
        <Link href="/requests?status=open" className="mb-6 flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <PackageOpenIcon className="size-4 text-muted-foreground" />
          <span>You have {myOpen} draft or returned request{myOpen > 1 ? "s" : ""} to finish.</span>
          <span className="ml-auto font-medium text-primary">Continue</span>
        </Link>
      )}

      {/* Status band — one surface, four readings */}
      <Panel className="mb-6 grid grid-cols-2 divide-border lg:grid-cols-4 lg:divide-x [&>div]:border-border max-lg:[&>div:nth-child(-n+2)]:border-b max-lg:[&>div:nth-child(odd)]:border-r">
        <Stat label="On hand" value={fmtNum(onHand)} hint={`${items.length} active items`} />
        <Stat label="Handed out, last 30 days" value={fmtNum(out30._sum.quantity ?? 0)} hint={`${fmtNum(out30._count)} handovers`} />
        <Stat label="Waiting for approval" value={String(pending.length)} hint={`${fmtNum(pending.reduce((s, p) => s + p.totalQty, 0))} units in review`} />
        <Stat
          label="Low or out of stock"
          value={String(items.filter((i) => i.availableQty <= i.reorderLevel).length)}
          hint={`${items.filter((i) => i.availableQty <= 0).length} out of stock`}
          tone={attention.length ? "warn" : undefined}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
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

      {runs.length > 0 && (
        <Panel className="mt-6">
          <PanelHeader
            title="Size runs"
            description="What's left of each size, so you can plan the next onboarding batch. The shaded height is the share still on the shelf."
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/stock?category=Apparel">All apparel</Link>
              </Button>
            }
          />
          <div className="grid gap-x-8 gap-y-6 px-5 py-5 md:grid-cols-2 2xl:grid-cols-3">
            {runs.map(([product, cells]) => (
              <SizeRun key={product} product={product} cells={cells} />
            ))}
          </div>
        </Panel>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Needs restocking"
            description="At or below the reorder level"
            actions={
              user.role === "EXECUTIVE" ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/receipts/new">
                    <ArrowDownToLineIcon data-icon="inline-start" />
                    Record stock inward
                  </Link>
                </Button>
              ) : undefined
            }
          />
          <ul className="divide-y">
            {attention.map((i) => (
              <li key={i.id}>
                <Link href={`/stock/${i.id}`} className="flex items-center gap-4 px-5 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{i.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.code} · reorder at {i.reorderLevel}
                    </span>
                  </div>
                  <StockGauge available={i.availableQty} total={i.openingQty + i.receivedQty} reorder={i.reorderLevel} className="w-48" />
                </Link>
              </li>
            ))}
            {!attention.length && <li className="px-5 py-6 text-sm text-muted-foreground">Every item is above its reorder level.</li>}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Recent decisions" description="Submissions, approvals and rejections" />
          <ol className="divide-y">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/requests/${e.requestId}`} className="flex items-start gap-3 px-5 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${e.action === "APPROVED" ? "bg-approved" : e.action === "REJECTED" ? "bg-rejected" : e.action === "CANCELLED" ? "bg-muted-foreground" : "bg-pending"}`}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm">
                      <span className="font-medium">{e.actor.name}</span> {verb(e.action)} <span className="font-medium">{e.request.number}</span>
                      {e.level > 0 && <span className="text-muted-foreground"> (level {e.level})</span>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {typeLabel(e.request.type)} · {e.request.title}
                    </span>
                    {e.remarks && <span className="text-xs text-muted-foreground italic">“{e.remarks}”</span>}
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</time>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  )
}

function verb(a: string) {
  return { SUBMITTED: "submitted", RESUBMITTED: "resubmitted", APPROVED: "approved", REJECTED: "rejected", CANCELLED: "deleted draft" }[a] ?? a.toLowerCase()
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "warn" }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`num text-3xl font-semibold tracking-tight ${tone === "warn" ? "text-pending" : ""}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  )
}
