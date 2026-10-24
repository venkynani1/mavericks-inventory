import { cn } from "@/lib/utils"

/** Three stacked stock boxes — the inventory "shelf" mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="#0f1e3d" />
      <rect x="7" y="17" width="8" height="8" rx="1.5" fill="#5b8fd9" />
      <rect x="17" y="17" width="8" height="8" rx="1.5" fill="#ffffff" />
      <rect x="12" y="7" width="8" height="8" rx="1.5" fill="#ffffff" />
    </svg>
  )
}

export function Brand({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className={inverted ? "ring-1 ring-white/15 rounded-[7px]" : undefined} />
      <div className="flex flex-col leading-none">
        <span className={cn("text-[15px] font-semibold tracking-tight", inverted ? "text-white" : "text-foreground")}>Mavericks Inventory</span>
        <span className={cn("mt-1 text-[11px]", inverted ? "text-white/55" : "text-muted-foreground")}>Hexaware</span>
      </div>
    </div>
  )
}
