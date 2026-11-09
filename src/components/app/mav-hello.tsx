import { GiftIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** A light greeting with a gift icon (no 3D, no extra download). */
export function MavHello({ message, sub, className, size = "md", tone = "light" }: { message: string; sub?: string; celebrate?: boolean; className?: string; size?: "sm" | "md" | "lg"; tone?: "light" | "dark" }) {
  const box = size === "lg" ? "size-16" : size === "sm" ? "size-10" : "size-12"
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className={cn("grid shrink-0 place-items-center rounded-2xl", box, tone === "dark" ? "bg-white/10 text-[#f1b73b]" : "bg-primary/10 text-primary")}>
        <GiftIcon className={size === "lg" ? "size-8" : size === "sm" ? "size-5" : "size-6"} />
      </span>
      <div className="min-w-0">
        <p className={cn("font-heading font-semibold", size === "lg" ? "text-2xl" : "text-lg")}>{message}</p>
        {sub && <p className={cn("text-sm", tone === "dark" ? "text-white/75" : "text-muted-foreground")}>{sub}</p>}
      </div>
    </div>
  )
}
