import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDaysIcon, GiftIcon, SparklesIcon, TrophyIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { progressOf } from "@/lib/points"
import { employeeOverview } from "@/lib/server/employee-data"
import { leaderboard } from "@/lib/server/leaderboard"
import { myEmployee } from "@/lib/server/portal"
import { getSettings } from "@/lib/server/settings"
import { cn, fmtDate, fmtNum } from "@/lib/utils"
import { Panel, PanelHeader } from "@/components/app/page-header"
import { MavHello } from "@/components/app/mav-hello"
import { CategoryBadge, Kpi, PointsProgress } from "@/components/app/rewards-display"
import { AwardsPanel, HistoryPanel, RewardsPanel } from "@/components/app/employee-sections"
import { PortalUnlinked } from "@/components/app/portal-unlinked"
import { AskMavButton } from "@/components/app/ask-mav-button"
import { StoreProgress } from "@/components/app/store-display"
import { storeCatalogue } from "@/lib/server/store"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "My dashboard" }

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()))
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

export default async function MyDashboard() {
  const [{ user, employeeId }, settings] = await Promise.all([myEmployee(), getSettings()])
  if (!employeeId) return <PortalUnlinked />
  const store = settings.rewardMode === "store"
  const [catalogue, data, upcoming, top] = await Promise.all([
    store ? storeCatalogue({ activeOnly: true }) : Promise.resolve([]),
    employeeOverview(employeeId),
    prisma.event.findMany({ where: { status: "PLANNED", date: { gte: new Date(Date.now() - 86400_000) } }, include: { eventType: true }, orderBy: { date: "asc" }, take: 4 }),
    settings.leaderboardForEmployees ? leaderboard("current", { take: 10 }) : Promise.resolve([]),
  ])
  if (!data) return <PortalUnlinked />
  const { emp } = data
  const p = progressOf(emp.points, settings.rewards)
  const statuses = Object.fromEntries(data.rewards.filter((r) => r.cycle === emp.cycle).map((r) => [r.threshold, r.status]))
  const due = data.rewards.filter((r) => r.status === "DUE" || r.status === "IN_PROGRESS").length
  const justEarned = data.rewards.some((r) => r.status === "DUE" && Date.now() - r.earnedAt.getTime() < 14 * 86400_000)
  const first = user.name.split(" ")[0]
  const openOrders = data.orders.filter((o) => o.status === "PLACED" || o.status === "ACCEPTED")
  const ready = data.orders.find((o) => o.status === "ACCEPTED")
  const canGet = catalogue.filter((c) => c.pointsCost <= emp.points)
  const nextGoal = catalogue.find((c) => c.pointsCost > emp.points)
  const storeLine = ready
    ? `Your ${ready.lines[0]?.name ?? "goodies"} ${ready.lines.length > 1 ? "and more are" : "is"} ready to collect.`
    : canGet.length
      ? `You can get ${canGet.length === 1 ? canGet[0].name : `${canGet.length} goodies`} from the store now.`
      : nextGoal
        ? `${fmtNum(nextGoal.pointsCost - emp.points)} points to a ${nextGoal.name}.`
        : "Keep collecting points."

  return (
    <>
      <section className="relative mb-5 overflow-hidden rounded-2xl bg-shell text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_20rem_at_80%_-20%,rgba(91,143,217,.45),transparent),radial-gradient(30rem_16rem_at_10%_120%,rgba(241,183,59,.25),transparent)]" />
        <div className="relative grid items-center gap-4 p-5 md:grid-cols-[auto_1fr] md:p-7">
          <MavHello tone="dark" size="md" celebrate={justEarned} message={`${greeting()}, ${first}!`} sub={store ? storeLine : justEarned ? "You've just unlocked a reward. Your goodie is on its way." : p.complete ? "You've reached the maximum. Legendary." : `${fmtNum(p.toNext)} points to your next goodie.`} />
          <div className="flex flex-col gap-1 md:items-end md:text-right">
            <span className="text-sm text-white/70">Your points</span>
            <span className="num font-heading text-5xl leading-none font-bold">{fmtNum(emp.points)}</span>
            <span className="text-sm text-white/70">{store ? `${fmtNum(emp.lifetimePoints)} earned in total` : `of ${fmtNum(settings.rewards.cap)}, ${p.reached} of ${p.total} milestones`}</span>
            {store && (
              <Button asChild size="sm" variant="secondary" className="mt-2">
                <Link href="/me/store">Spend points</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Events attended" value={fmtNum(data.attended.length)} icon={<CalendarDaysIcon />} href="/me/events" />
        <Kpi label="Goodies received" value={fmtNum(data.goodies.length)} icon={<GiftIcon />} tone="good" href="/me/goodies" />
        {store ? (
          <Kpi label="Orders in progress" value={fmtNum(openOrders.length)} hint={ready ? "Ready to collect" : undefined} icon={<SparklesIcon />} tone="reward" href="/me/orders" />
        ) : (
          <Kpi label="Rewards on the way" value={fmtNum(due)} icon={<SparklesIcon />} tone="reward" href="/me/goodies" />
        )}
        <Kpi label="Your rank" value={emp.points > 0 ? `#${fmtNum(data.rank)}` : "—"} icon={<TrophyIcon />} tone="warn" />
      </div>

      {store ? (
        <Panel className="mb-5">
          <PanelHeader title="What your points can get" description="Order any goodie you can afford, or keep saving for a bigger one. The points are taken off when you order." actions={<Link href="/me/store" className="text-sm text-primary hover:underline">Open the store</Link>} />
          <StoreProgress points={emp.points} items={catalogue} />
        </Panel>
      ) : (
        <Panel className="mb-5">
          <PanelHeader title={`Your journey to ${fmtNum(settings.rewards.cap)}`} description={`A goodie at every ${fmtNum(settings.rewards.step)} points.`} />
          <div className="px-5 pb-5">
            <PointsProgress points={emp.points} rules={settings.rewards} statuses={statuses} />
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <AwardsPanel data={data} hideEmpty />
          {!store && <RewardsPanel data={data} step={settings.rewards.step} />}
          <HistoryPanel data={data} limit={8} />
        </div>
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Coming up" description="Attend to earn points" actions={<Link href="/me/events" className="text-sm text-primary hover:underline">All</Link>} />
            {upcoming.length ? (
              <ul className="divide-y">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 px-5 py-3">
                    <span className="font-medium">{e.name}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="num">{fmtDate(e.date)}</span>
                      {e.location && <span>{e.location}</span>}
                      <CategoryBadge category={e.eventType.category} className="h-5" />
                      <span className="num font-semibold text-approved">+{fmtNum(e.points ?? e.eventType.points)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-muted-foreground">No events scheduled yet.</p>
            )}
          </Panel>
          {top.length > 0 && (
            <Panel>
              <PanelHeader title="Top 10" description="Current points" />
              <ol className="divide-y">
                {top.map((r, i) => (
                  <li key={r.id} className={cn("flex items-center gap-3 px-5 py-2.5 text-sm", r.id === emp.id && "bg-accent/60 font-semibold")}>
                    <span className="num w-5 text-right text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 truncate">{r.name}{r.id === emp.id && " (you)"}</span>
                    <span className="num">{fmtNum(r.score)}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          <Panel className="flex flex-col items-start gap-3 p-5">
            <p className="font-medium">Questions about your points?</p>
            <p className="text-sm text-muted-foreground">Ask Mav. It can see only your own points, goodies and events.</p>
            <AskMavButton />
          </Panel>
        </div>
      </div>
    </>
  )
}
