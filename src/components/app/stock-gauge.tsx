import { cn, fmtNum } from "@/lib/utils"

/**
 * Shelf gauge: the full width is everything ever stocked (opening + received).
 * The dark part is what's still on the shelf; the hatched part has gone out. A tick marks the reorder level.
 */
export function StockGauge({ available, total, reorder = 0, className, showLabel = true }: { available: number; total: number; reorder?: number; className?: string; showLabel?: boolean }) {
  const t = Math.max(total, available, 1)
  const pct = Math.max(0, Math.min(100, (available / t) * 100))
  const low = available <= reorder
  const out = available <= 0
  return (
    <div className={cn("flex min-w-32 items-center gap-2.5", className)}>
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-[repeating-linear-gradient(135deg,var(--shelf)_0_4px,transparent_4px_7px)] ring-1 ring-border ring-inset"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={t}
        aria-valuenow={available}
        aria-label={`${available} of ${t} on hand`}
      >
        <div className={cn("h-full rounded-full", out ? "bg-rejected" : low ? "bg-pending" : "bg-primary")} style={{ width: `${pct}%` }} />
        {reorder > 0 && reorder < t && <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${(reorder / t) * 100}%` }} />}
      </div>
      {showLabel && (
        <span className="num w-20 text-right text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{fmtNum(available)}</span> / {fmtNum(t)}
        </span>
      )}
    </div>
  )
}
