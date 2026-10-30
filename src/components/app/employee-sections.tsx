import Link from "next/link"
import { CalendarDaysIcon, GiftIcon, HistoryIcon, MedalIcon, PackageIcon, TicketIcon, TrophyIcon } from "lucide-react"
import { prizeText } from "@/lib/server/awards"
import type { EmployeeOverview } from "@/lib/server/employee-data"
import { cn, fmtDate, fmtNum } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Panel, PanelHeader } from "./page-header"
import { AwardStatusBadge, CategoryBadge, POSITION_TONE, RewardStatusBadge } from "./rewards-display"

const TX_LABEL: Record<string, string> = { EVENT: "Event", ADJUSTMENT: "Adjustment", RESET: "Reset", REVERSAL: "Reversal", AWARD: "Prize bonus" }

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>
}

/** Milestone cards: reached (with status) and upcoming (with the goodie, when decided). */
export function RewardsPanel({ data, staff, step }: { data: EmployeeOverview; staff?: boolean; step: number }) {
  const current = data.rewards.filter((r) => r.cycle === data.emp.cycle && r.status !== "CANCELLED")
  const byT = new Map(current.map((r) => [r.threshold, r]))
  const earlier = data.rewards.filter((r) => r.cycle !== data.emp.cycle && r.status !== "CANCELLED")
  return (
    <Panel>
      <PanelHeader title="Rewards" description={`A goodie at every ${fmtNum(step)} points${data.emp.cycle > 1 ? `. Cycle ${data.emp.cycle}` : ""}.`} />
      <ol className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
        {data.milestones.map((m) => {
          const r = byT.get(m.threshold)
          const reached = data.emp.points >= m.threshold || !!r
          return (
            <li key={m.id} className={cn("flex flex-col gap-1.5 rounded-xl border p-3", r?.status === "ISSUED" ? "border-approved/30 bg-approved-soft/40" : r ? "border-reward/40 bg-reward-soft/50" : "border-dashed bg-card")}>
              <div className="flex items-center justify-between gap-2">
                <span className="num text-sm font-semibold">{fmtNum(m.threshold)}</span>
                {r ? <RewardStatusBadge status={r.status} staffView={staff} /> : <GiftIcon className={cn("size-4", reached ? "text-reward" : "text-muted-foreground/50")} />}
              </div>
              <span className="text-sm font-medium">{m.title}</span>
              <span className="text-xs text-muted-foreground">{r?.line?.stockItem.name ?? m.stockItem?.name ?? "Goodie to be announced"}</span>
              {r?.issuedAt && <span className="text-xs text-muted-foreground">Received {fmtDate(r.issuedAt)}</span>}
            </li>
          )
        })}
      </ol>
      {earlier.length > 0 && (
        <p className="border-t px-5 py-3 text-sm text-muted-foreground">
          Earlier cycles: {earlier.map((r) => `${fmtNum(r.threshold)} (cycle ${r.cycle}, ${r.status === "ISSUED" ? "received" : r.status.toLowerCase().replace("_", " ")})`).join(", ")}
        </p>
      )}
    </Panel>
  )
}

export function HistoryPanel({ data, limit, staff }: { data: EmployeeOverview; limit?: number; staff?: boolean }) {
  const rows = limit ? data.history.slice(0, limit) : data.history
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title={<span className="inline-flex items-center gap-2"><HistoryIcon className="size-4 text-muted-foreground" />Points history</span>} actions={limit && data.history.length > limit ? <Link className="text-sm text-primary hover:underline" href={staff ? "?tab=history" : "/me/history"}>See all</Link> : undefined} />
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">When</TableHead>
              <TableHead>What</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="pr-5 text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="num pl-5 whitespace-nowrap text-muted-foreground">{fmtDate(h.createdAt)}</TableCell>
                <TableCell className="max-w-0 w-full">
                  <div className="flex flex-col">
                    <span className="truncate">
                      {h.event ? (staff ? <Link className="hover:text-primary" href={`/events/${h.event.id}`}>{h.event.name}</Link> : h.event.name) : (h.reason ?? TX_LABEL[h.type])}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {TX_LABEL[h.type]}
                      {h.event && h.type !== "EVENT" && h.reason ? `: ${h.reason}` : ""}
                      {staff ? `, by ${h.actor}` : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell className={cn("num text-right font-medium", h.points > 0 ? "text-approved" : h.points < 0 ? "text-rejected" : "text-muted-foreground")}>
                  {h.points > 0 ? "+" : ""}
                  {fmtNum(h.points)}
                </TableCell>
                <TableCell className="num pr-5 text-right">{fmtNum(h.balanceAfter)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyRow>No points yet. Attend an event to start earning.</EmptyRow>
      )}
    </Panel>
  )
}

export function EventsAttendedPanel({ data, limit, staff }: { data: EmployeeOverview; limit?: number; staff?: boolean }) {
  const rows = limit ? data.attended.slice(0, limit) : data.attended
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title={<span className="inline-flex items-center gap-2"><CalendarDaysIcon className="size-4 text-muted-foreground" />Events attended ({data.attended.length})</span>} />
      {rows.length ? (
        <ul className="divide-y">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                {staff ? <Link href={`/events/${a.eventId}`} className="truncate font-medium hover:text-primary">{a.event.name}</Link> : <span className="truncate font-medium">{a.event.name}</span>}
                <span className="num text-xs text-muted-foreground">{fmtDate(a.event.date)}{a.event.location ? `, ${a.event.location}` : ""}</span>
              </div>
              <CategoryBadge category={a.event.eventType.category} className="hidden sm:inline-flex" />
              <span className="num w-16 text-right text-sm font-medium text-approved">+{fmtNum(a.pointsAwarded)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>No events attended yet.</EmptyRow>
      )}
    </Panel>
  )
}

export function GoodiesPanel({ data, staff }: { data: EmployeeOverview; staff?: boolean }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title={<span className="inline-flex items-center gap-2"><PackageIcon className="size-4 text-muted-foreground" />Goodies received ({data.goodies.length})</span>} />
      {data.goodies.length ? (
        <ul className="divide-y">
          {data.goodies.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary"><GiftIcon className="size-4" /></span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{g.stockItem.name}{g.quantity > 1 ? ` x${g.quantity}` : ""}</span>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(g.distributedOn)}
                  {g.purpose ? `, ${g.purpose}` : ""}
                  {g.remarks ? `, ${g.remarks}` : ""}
                </span>
              </div>
              {staff && <Link href={`/requests/${g.request.id}`} className="num text-xs text-muted-foreground hover:text-primary">{g.request.number}</Link>}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>No goodies recorded yet.</EmptyRow>
      )}
    </Panel>
  )
}


/** Prizes won at events: position, prize and whether it has been handed over. */
export function AwardsPanel({ data, staff, hideEmpty }: { data: EmployeeOverview; staff?: boolean; hideEmpty?: boolean }) {
  if (hideEmpty && !data.awards.length) return null
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title={<span className="inline-flex items-center gap-2"><MedalIcon className="size-4 text-reward" />{staff ? "Event prizes" : "Your prizes"} ({data.awards.length})</span>} description={staff ? undefined : "Prizes you won at events"} />
      {data.awards.length ? (
        <ul className="divide-y">
          {data.awards.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-reward-soft text-reward">
                {a.kind === "VOUCHER" ? <TicketIcon className="size-4" /> : a.kind === "GOODIE" ? <GiftIcon className="size-4" /> : <TrophyIcon className="size-4" />}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium", POSITION_TONE(a.position))}>{a.position}</span>
                  <span className="truncate font-medium">{prizeText(a)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {staff ? <Link href={`/events/${a.event.id}`} className="hover:text-primary">{a.event.name}</Link> : a.event.name}, {fmtDate(a.event.date)}
                  {a.bonusPoints ? `, +${fmtNum(a.bonusPoints)} bonus points` : ""}
                </span>
              </div>
              <AwardStatusBadge status={a.status} employeeView={!staff} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>No prizes yet. Win at a hackathon or codeathon to see them here.</EmptyRow>
      )}
    </Panel>
  )
}
