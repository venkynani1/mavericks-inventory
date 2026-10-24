"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { SearchIcon, XIcon } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/** Writes filter changes into the URL so every filtered view is shareable and server-rendered. */
function useParamSetter() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const set = (key: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString())
    if (value) sp.set(key, value)
    else sp.delete(key)
    sp.delete("page")
    start(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }))
  }
  return { set, params, pending }
}

export function SearchFilter({ param = "q", placeholder, className }: { param?: string; placeholder: string; className?: string }) {
  const { set, params, pending } = useParamSetter()
  const [v, setV] = useState(params.get(param) ?? "")
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get(param) ?? "") !== v) set(param, v.trim() || null)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v])
  return (
    <InputGroup className={cn("h-9 w-full sm:w-72 bg-card", className)}>
      <InputGroupAddon>{pending ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
      <InputGroupInput value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {v && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setV("")}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export function SelectFilter({ param, label, options, allLabel = "All", className }: { param: string; label: string; options: { value: string; label: string }[]; allLabel?: string; className?: string }) {
  const { set, params } = useParamSetter()
  const value = params.get(param) ?? "__all"
  return (
    <Select value={value} onValueChange={(v) => set(param, v === "__all" ? null : v)}>
      <SelectTrigger className={cn("h-9 min-w-40 bg-card", className)} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="__all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function DateFilter({ param, label }: { param: string; label: string }) {
  const { set, params } = useParamSetter()
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {label}
      <Input type="date" className="h-9 w-40 bg-card" value={params.get(param) ?? ""} onChange={(e) => set(param, e.target.value || null)} />
    </label>
  )
}

export function Segmented({ param, options }: { param: string; options: { value: string; label: string; count?: number }[] }) {
  const { set, params } = useParamSetter()
  const current = params.get(param) ?? options[0].value
  return (
    <div role="tablist" className="inline-flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={current === o.value}
          onClick={() => set(param, o.value === options[0].value ? null : o.value)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            current === o.value && "bg-card font-medium text-foreground shadow-xs",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="num text-xs text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
