import Link from "next/link"
import { CalendarClockIcon, GiftIcon, MapPinIcon } from "lucide-react"
import { cn, fmtDate, fmtDateTime, fmtNum } from "@/lib/utils"

const OS: Record<string, { label: string; employee: string; cls: string }> = {
  PLACED: { label: "Waiting for the team", employee: "Order placed", cls: "bg-pending-soft text-pending" },
  ACCEPTED: { label: "Ready for pickup", employee: "Ready to collect", cls: "bg-accent text-accent-foreground" },
  COLLECTED: { label: "Collected", employee: "Collected", cls: "bg-approved-soft text-approved" },
  REJECTED: { label: "Rejected", employee: "Rejected, points refunded", cls: "bg-rejected-soft text-rejected" },
  CANCELLED: { label: "Cancelled", employee: "Cancelled, points refunded", cls: "bg-muted text-muted-foreground" },
}

export function OrderStatusBadge({ status, employeeView }: { status: string; employeeView?: boolean }) {
  const m = OS[status] ?? OS.PLACED
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", m.cls)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {employeeView ? m.employee : m.label}
    </span>
  )
}

/** How close the person is to each goodie in the store. */
export function StoreProgress({ points, items, limit = 6 }: { points: number; items: { id: string; name: string; pointsCost: number }[]; limit?: number }) {
  if (!items.length) return <p className="px-5 py-6 text-sm text-muted-foreground">The store has no goodies yet.</p>
  const shown = items.slice(0, limit)
  return (
    <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map((i) => {
        const ok = points >= i.pointsCost
        const pct = Math.min(100, Math.round((points / i.pointsCost) * 100))
        return (
          <li key={i.id} className={cn("flex flex-col gap-2 rounded-xl border p-3", ok ? "border-approved/30 bg-approved-soft/40" : "border-dashed")}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium"><GiftIcon className={cn("size-4 shrink-0", ok ? "text-approved" : "text-muted-foreground")} /><span className="truncate">{i.name}</span></span>
              <span className="num text-sm font-semibold">{fmtNum(i.pointsCost)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn("h-full rounded-full", ok ? "bg-approved" : "bg-primary")} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{ok ? "You can get this now" : `${fmtNum(i.pointsCost - points)} more points`}</span>
          </li>
        )
      })}
    </ul>
  )
}

export type OrderView = {
  id: string
  number: string
  status: string
  totalPoints: number
  createdAt: Date
  note: string | null
  pickupLocation: string | null
  pickupAt: Date | null
  pickupNote: string | null
  rejectReason: string | null
  collectedAt: Date | null
  lines: { id: string; name: string; quantity: number; pointsCost: number }[]
}

/** One order as the employee sees it: what, how many points, and where and when to collect. */
export function OrderCard({ o, actions }: { o: OrderView; actions?: React.ReactNode }) {
  return (
    <article className="rounded-xl border bg-card" aria-label={`Order ${o.number}`}>
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <span className="num font-semibold">{o.number}</span>
        <span className="num text-sm text-muted-foreground">{fmtDateTime(o.createdAt)}</span>
        <span className="ml-auto"><OrderStatusBadge status={o.status} employeeView /></span>
      </header>
      <ul className="divide-y text-sm">
        {o.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-5 py-2">
            <span className="flex-1">{l.name}{l.quantity > 1 && <span className="text-muted-foreground"> x{l.quantity}</span>}</span>
            <span className="num text-muted-foreground">{fmtNum(l.pointsCost * l.quantity)} pts</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t px-5 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Points spent</span>
          <span className={cn("num font-semibold", (o.status === "REJECTED" || o.status === "CANCELLED") && "line-through text-muted-foreground")}>{fmtNum(o.totalPoints)}</span>
        </div>
        {o.status === "PLACED" && <p className="text-muted-foreground">The engagement team will accept your order and tell you where and when to collect it.</p>}
        {o.status === "ACCEPTED" && o.pickupAt && (
          <div className="rounded-lg bg-accent/60 p-3">
            <p className="font-medium">Collect your goodies</p>
            <p className="mt-1 flex items-center gap-2"><MapPinIcon className="size-4 shrink-0" />{o.pickupLocation}</p>
            <p className="mt-1 flex items-center gap-2"><CalendarClockIcon className="size-4 shrink-0" /><span className="num">{fmtDateTime(o.pickupAt)}</span></p>
            {o.pickupNote && <p className="mt-1 text-muted-foreground">{o.pickupNote}</p>}
          </div>
        )}
        {o.status === "COLLECTED" && o.collectedAt && <p className="text-muted-foreground">Collected on {fmtDate(o.collectedAt)}.</p>}
        {o.status === "REJECTED" && o.rejectReason && <p className="text-rejected">Reason: {o.rejectReason}</p>}
        {actions}
      </div>
    </article>
  )
}

export function StoreLink() {
  return <Link href="/me/store" className="text-sm text-primary hover:underline">Open the store</Link>
}
