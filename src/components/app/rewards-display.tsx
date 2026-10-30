import Link from "next/link"
import { GiftIcon } from "lucide-react"
import { milestoneList, progressOf, type RewardRules } from "@/lib/points"
import { cn, fmtNum } from "@/lib/utils"

export const CATEGORY_LABEL: Record<string, string> = { TECH: "Tech", NON_TECH: "Non-tech", WORKSHOP: "Workshop", HACKATHON: "Hackathon", CODEATHON: "Codeathon", OTHER: "Other" }
const CATEGORY_CLS: Record<string, string> = {
  TECH: "bg-accent text-accent-foreground",
  NON_TECH: "bg-[#f3e8fb] text-[#6b3fa0] dark:bg-[#2e2142] dark:text-[#cfb1f0]",
  WORKSHOP: "bg-approved-soft text-approved",
  HACKATHON: "bg-rejected-soft text-rejected",
  CODEATHON: "bg-pending-soft text-pending",
  OTHER: "bg-draft-soft text-draft",
}

export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap", CATEGORY_CLS[category], className)}>{CATEGORY_LABEL[category] ?? category}</span>
}

const EV: Record<string, { label: string; cls: string }> = {
  PLANNED: { label: "Planned", cls: "bg-accent text-accent-foreground" },
  COMPLETED: { label: "Completed", cls: "bg-approved-soft text-approved" },
  CANCELLED: { label: "Cancelled", cls: "bg-muted text-muted-foreground line-through" },
}
export function EventStatusBadge({ status }: { status: string }) {
  const m = EV[status]
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", m.cls)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {m.label}
    </span>
  )
}

const RW: Record<string, { label: string; cls: string }> = {
  DUE: { label: "Due", cls: "bg-reward-soft text-reward" },
  IN_PROGRESS: { label: "On the way", cls: "bg-pending-soft text-pending" },
  ISSUED: { label: "Received", cls: "bg-approved-soft text-approved" },
  CANCELLED: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
}
export function RewardStatusBadge({ status, staffView }: { status: string; staffView?: boolean }) {
  const m = RW[status]
  const label = staffView && status === "ISSUED" ? "Issued" : staffView && status === "IN_PROGRESS" ? "In approval" : m.label
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", m.cls)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  )
}

/**
 * The points track from 0 to the cap, with a gift at every milestone.
 * Reached milestones are filled; the next one is highlighted.
 */
export function PointsProgress({ points, rules, statuses, size = "md", className }: { points: number; rules: RewardRules; statuses?: Record<number, string>; size?: "sm" | "md"; className?: string }) {
  const p = progressOf(points, rules)
  const ms = milestoneList(rules)
  if (size === "sm")
    return (
      <div className={cn("flex min-w-28 items-center gap-2", className)}>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={rules.cap} aria-valuenow={p.points} aria-label={`${p.points} of ${rules.cap} points`}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#2350a8] to-[#d99a2b]" style={{ width: `${p.capPercent}%` }} />
        </div>
        <span className="num w-10 text-right text-xs text-muted-foreground">{p.capPercent}%</span>
      </div>
    )
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative pt-9 pb-7">
        <div className="relative h-3 rounded-full bg-muted ring-1 ring-border ring-inset" role="meter" aria-valuemin={0} aria-valuemax={rules.cap} aria-valuenow={p.points} aria-label={`${fmtNum(p.points)} of ${fmtNum(rules.cap)} points`}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#2350a8] via-[#4f7fd6] to-[#d99a2b] transition-[width] duration-700" style={{ width: `${p.capPercent}%` }} />
        </div>
        {/* current position flag */}
        <div className="absolute top-0 -translate-x-1/2" style={{ left: `${Math.min(97, Math.max(3, p.capPercent))}%` }}>
          <span className="num block rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-background">{fmtNum(p.points)}</span>
          <span className="mx-auto block size-0 border-x-4 border-t-4 border-x-transparent border-t-foreground" />
        </div>
        {ms.map((t) => {
          const reached = p.points >= t
          const st = statuses?.[t]
          const left = (t / rules.cap) * 100
          return (
            <div key={t} className="absolute top-[34px] flex -translate-x-1/2 flex-col items-center" style={{ left: `${left}%` }}>
              <span
                title={`${fmtNum(t)} points${st ? `: ${st.toLowerCase().replace("_", " ")}` : ""}`}
                className={cn(
                  "grid size-5 place-items-center rounded-full border-2 bg-card",
                  reached ? (st === "ISSUED" ? "border-approved bg-approved text-white" : "border-reward bg-reward text-white") : t === p.next ? "border-primary text-primary" : "border-border text-muted-foreground",
                )}
              >
                <GiftIcon className="size-2.5" />
              </span>
              <span className={cn("num mt-1 hidden text-[10px] sm:block", reached ? "font-semibold text-foreground" : "text-muted-foreground")}>{t >= 1000 ? `${t / 1000}k` : t}</span>
            </div>
          )
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        {p.complete ? (
          <>All {p.total} milestones reached. You&apos;re at the maximum of {fmtNum(rules.cap)} points.</>
        ) : (
          <>
            <span className="num font-semibold text-foreground">{fmtNum(p.toNext)}</span> points to the next goodie at <span className="num font-medium text-foreground">{fmtNum(p.next!)}</span>. {p.reached} of {p.total} milestones reached.
          </>
        )}
      </p>
    </div>
  )
}

export function Kpi({ label, value, hint, tone, icon, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "warn" | "danger" | "good" | "reward"; icon?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {icon && (
          <span className={cn("grid size-8 place-items-center rounded-lg [&_svg]:size-4", tone === "warn" ? "bg-pending-soft text-pending" : tone === "danger" ? "bg-rejected-soft text-rejected" : tone === "good" ? "bg-approved-soft text-approved" : tone === "reward" ? "bg-reward-soft text-reward" : "bg-accent text-primary")}>
            {icon}
          </span>
        )}
      </div>
      <span className="num font-heading text-[26px] leading-none font-semibold">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  )
  const cls = "flex flex-col gap-2 rounded-xl border bg-card p-4"
  return href ? (
    <Link href={href} className={cn(cls, "outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

const AW: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "To hand out", cls: "bg-reward-soft text-reward" },
  IN_APPROVAL: { label: "In approval", cls: "bg-pending-soft text-pending" },
  ISSUED: { label: "Issued", cls: "bg-approved-soft text-approved" },
  CANCELLED: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
}
export function AwardStatusBadge({ status, employeeView }: { status: string; employeeView?: boolean }) {
  const m = AW[status]
  const label = employeeView ? ({ PENDING: "On the way", IN_APPROVAL: "On the way", ISSUED: "Received", CANCELLED: "Cancelled" } as Record<string, string>)[status] : m.label
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", m.cls)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  )
}

/** Colour for a prize position: gold for winners, blue for runners-up, grey for the rest. */
export const POSITION_TONE = (p: string) => (/^winner/i.test(p) ? "bg-reward-soft text-reward" : /runner/i.test(p) ? "bg-accent text-accent-foreground" : "bg-muted text-foreground")
