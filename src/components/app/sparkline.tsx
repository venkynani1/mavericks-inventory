import { cn } from "@/lib/utils"

/** Tiny trend line for KPI tiles. Server-rendered SVG, no chart library. */
export function Sparkline({ values, className, label }: { values: number[]; className?: string; label?: string }) {
  if (values.length < 2) return null
  const w = 120
  const h = 32
  const max = Math.max(1, ...values)
  const step = w / (values.length - 1)
  const pts = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)] as const)
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-8 w-full text-primary", className)} role="img" aria-label={label ?? "Trend"} preserveAspectRatio="none">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="currentColor" opacity={0.1} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill="currentColor" />
    </svg>
  )
}
