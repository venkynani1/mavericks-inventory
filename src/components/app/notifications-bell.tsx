"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { BellIcon, CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type Notice = { id: string; tone: "info" | "warn" | "danger" | "success"; title: string; detail: string; href: string }

const TONE = {
  info: { icon: InfoIcon, cls: "text-primary bg-accent" },
  warn: { icon: TriangleAlertIcon, cls: "text-pending bg-pending-soft" },
  danger: { icon: CircleAlertIcon, cls: "text-rejected bg-rejected-soft" },
  success: { icon: CircleCheckIcon, cls: "text-approved bg-approved-soft" },
}

/** Loads after the page has rendered, so it never slows navigation down. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notice[] | null>(null)
  const pathname = usePathname()
  const load = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { notices: [] }))
      .then((d) => setItems(d.notices ?? []))
      .catch(() => setItems([]))
  }, [])
  useEffect(() => {
    const t = setTimeout(load, 600)
    return () => clearTimeout(t)
  }, [load, pathname])
  const n = items?.filter((i) => i.tone !== "info").length ?? 0

  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o && load())}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={n ? `Notifications, ${n} need attention` : "Notifications"} className="relative grid size-9 place-items-center rounded-md text-shell-foreground/85 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60">
          <BellIcon className="size-[18px]" />
          {n > 0 && <span className="num absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#e5533d] px-1 text-[10px] font-semibold text-white">{n}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Needs your attention</p>
        </div>
        {items === null ? (
          <div className="grid place-items-center py-10"><Spinner /></div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((i) => {
              const T = TONE[i.tone]
              return (
                <li key={i.id}>
                  <Link href={i.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", T.cls)}><T.icon className="size-4" /></span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{i.title}</span>
                      <span className="text-xs text-muted-foreground">{i.detail}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
