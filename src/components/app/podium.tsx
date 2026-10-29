import Link from "next/link"
import { CrownIcon } from "lucide-react"
import { cn, fmtNum, initials } from "@/lib/utils"

type P = { id: string; name: string; sub?: string; score: number; href?: string }

/** Top three, arranged second, first, third like a real podium. */
export function Podium({ people, unit = "pts" }: { people: P[]; unit?: string }) {
  const order = [people[1], people[0], people[2]]
  const H = ["h-20", "h-28", "h-14"]
  const C = ["from-[#c7cfdb] to-[#9aa6b8]", "from-[#f3c862] to-[#d99a2b]", "from-[#e2a774] to-[#b8743c]"]
  const R = [2, 1, 3]
  return (
    <div className="grid grid-cols-3 items-end gap-3 px-2 pt-4">
      {order.map((p, i) =>
        p ? (
          <div key={p.id} className="flex min-w-0 flex-col items-center gap-2">
            <div className="relative">
              {R[i] === 1 && <CrownIcon className="absolute -top-5 left-1/2 size-5 -translate-x-1/2 text-[#d99a2b]" aria-hidden />}
              <span className={cn("grid place-items-center rounded-full bg-gradient-to-br font-semibold text-white shadow-md ring-4 ring-card", C[i], R[i] === 1 ? "size-16 text-lg" : "size-12")}>{initials(p.name)}</span>
            </div>
            {p.href ? (
              <Link href={p.href} className="max-w-full truncate text-center text-sm font-semibold hover:text-primary">{p.name}</Link>
            ) : (
              <span className="max-w-full truncate text-center text-sm font-semibold">{p.name}</span>
            )}
            {p.sub && <span className="-mt-1.5 max-w-full truncate text-xs text-muted-foreground">{p.sub}</span>}
            <div className={cn("flex w-full flex-col items-center justify-start rounded-t-lg bg-gradient-to-b pt-2 text-white", C[i], H[i])}>
              <span className="font-heading text-2xl leading-none font-bold">{R[i]}</span>
              <span className="num mt-1 text-xs font-semibold">{fmtNum(p.score)} {unit}</span>
            </div>
          </div>
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  )
}
