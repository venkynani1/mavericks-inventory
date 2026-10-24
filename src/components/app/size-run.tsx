import Link from "next/link"
import { cn, fmtNum } from "@/lib/utils"

const ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]

export type SizeCell = { id: string; size: string; available: number; total: number; reorder: number }

/**
 * Size run: one apparel line laid out as a shelf of sizes, so gaps (an XXL that's nearly gone)
 * are visible at a glance — the question stores teams answer most before an onboarding batch.
 */
export function SizeRun({ product, cells }: { product: string; cells: SizeCell[] }) {
  const sorted = [...cells].sort((a, b) => (ORDER.indexOf(a.size) + 99) % 99 - (ORDER.indexOf(b.size) + 99) % 99)
  const total = cells.reduce((s, c) => s + c.available, 0)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{product}</span>
        <span className="num shrink-0 text-xs text-muted-foreground">{fmtNum(total)} on hand</span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(sorted.length, 1)}, minmax(0, 1fr))` }}>
        {sorted.map((c) => {
          const ratio = c.total ? c.available / c.total : 0
          const state = c.available <= 0 ? "out" : c.available <= c.reorder ? "low" : "ok"
          return (
            <Link
              key={c.id}
              href={`/stock/${c.id}`}
              className={cn(
                "group relative flex h-16 flex-col justify-end overflow-hidden rounded-md border bg-shelf/50 px-1.5 pb-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                state === "out" && "border-rejected/40",
                state === "low" && "border-pending/50",
              )}
              title={`${c.size}: ${c.available} of ${c.total} on hand`}
            >
              <span
                className={cn("absolute inset-x-0 bottom-0 transition-[height]", state === "out" ? "bg-rejected/15" : state === "low" ? "bg-pending/20" : "bg-primary/15")}
                style={{ height: `${Math.max(4, ratio * 100)}%` }}
                aria-hidden
              />
              <span className="relative num text-[15px] leading-none font-semibold">{c.available}</span>
              <span className="relative mt-1 text-[11px] text-muted-foreground group-hover:text-foreground">{c.size}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
