"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { useTheme } from "next-themes"
import { BoxIcon, CalendarDaysIcon, FileTextIcon, KeyRoundIcon, LogOutIcon, MoonIcon, PanelLeftIcon, SearchIcon, SparklesIcon, SunIcon, UserRoundIcon } from "lucide-react"
import { searchEverything } from "@/app/actions/search"
import { logout } from "@/app/actions/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/components/ui/sidebar"
import { navFor } from "@/lib/nav"
import { isStaff, ROLE_LABEL, type Role } from "@/lib/roles"
import { fmtDate, fmtNum, initials } from "@/lib/utils"
import { BrandMark } from "./brand"
import { NAV_ICONS } from "./app-sidebar"
import { NotificationsBell } from "./notifications-bell"
import { StatusBadge, type ReqStatus } from "./status-badge"

type Results = Awaited<ReturnType<typeof searchEverything>>
const EMPTY: Results = { items: [], requests: [], employees: [], events: [] }

export const openAssistant = () => window.dispatchEvent(new CustomEvent("assistant:open"))

const shellBtn =
  "grid size-9 place-items-center rounded-md text-shell-foreground/85 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"

/** The dark masthead across the top of every page: navigation toggle, brand, search, assistant, alerts, account. */
export function Topbar({ user }: { user: { name: string; email: string; role: Role } }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Results>(EMPTY)
  const [, start] = useTransition()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const { toggleSidebar } = useSidebar()
  const staff = isStaff(user.role)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName) && !(e.target as HTMLElement)?.isContentEditable)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Ask the server only when there's something to search for.
  useEffect(() => {
    if (!open || q.trim().length < 2 || !staff) {
      setRes(EMPTY)
      return
    }
    const t = setTimeout(() => start(async () => setRes(await searchEverything(q))), 180)
    return () => clearTimeout(t)
  }, [q, open, staff])

  const go = (href: string) => {
    setOpen(false)
    setQ("")
    router.push(href)
  }
  const pages = navFor(user.role)
    .flatMap((g) => g.items)
    .filter((i) => !q.trim() || i.label.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center gap-1 bg-shell px-2 text-shell-foreground shadow-[0_1px_0_rgba(255,255,255,0.06)] md:px-3">
      <button type="button" onClick={toggleSidebar} aria-label="Show or hide navigation" className={shellBtn}>
        <PanelLeftIcon className="size-[18px]" />
      </button>
      <Link href={staff ? "/" : "/me"} className="mr-2 flex items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-label="Mavericks Inventory home">
        <BrandMark className="size-7 rounded-[7px] ring-1 ring-white/15" />
        <span className="hidden flex-col leading-none sm:flex">
          <span className="text-[14px] font-semibold tracking-tight text-white">Mavericks Inventory</span>
          <span className="mt-0.5 text-[10.5px] text-shell-muted">Hexaware {staff ? "Stores & Engagement" : "Employee portal"}</span>
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-full max-w-xl min-w-0 items-center gap-2 rounded-md border border-white/10 bg-shell-field px-3 text-sm text-shell-muted outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="truncate">{staff ? "Search items, requests, employees, events or pages" : "Go to a page"}</span>
          <kbd className="ml-auto hidden rounded border border-white/15 px-1.5 text-[11px] text-shell-muted sm:inline">Ctrl K</kbd>
        </button>
      </div>

      <div className="ml-1 flex items-center gap-0.5">
        <button type="button" onClick={openAssistant} className="hidden h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 sm:flex" aria-label="Open the assistant">
          <SparklesIcon className="size-4 text-[#9cbcf2]" />
          <span className="hidden lg:inline">Ask Mav</span>
        </button>
        <button type="button" onClick={openAssistant} className={`${shellBtn} sm:hidden`} aria-label="Open the assistant">
          <SparklesIcon className="size-[18px]" />
        </button>
        <NotificationsBell />
        <button type="button" className={shellBtn} aria-label="Switch light or dark theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <SunIcon className="hidden size-[18px] dark:block" />
          <MoonIcon className="size-[18px] dark:hidden" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ml-1 flex h-9 items-center gap-2 rounded-md px-1.5 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60" aria-label="Account menu">
              <Avatar className="size-7">
                <AvatarFallback className="bg-[#2d5cb8] text-[11px] font-semibold text-white">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="hidden flex-col items-start leading-tight md:flex">
                <span className="text-[13px] font-medium text-white">{user.name}</span>
                <span className="text-[11px] text-shell-muted">{ROLE_LABEL[user.role]}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col">
              <span>{user.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <KeyRoundIcon />
                  Profile and password
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => start(() => logout())}>
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Find pages, stock items, requests, employees and events" className="sm:max-w-xl">
        <Command shouldFilter={false}>
          <CommandInput placeholder={staff ? "Item, stock code, request number, employee or event…" : "Page name…"} value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{q.trim().length < 2 ? "Type at least two characters." : "Nothing matches that search."}</CommandEmpty>
            {pages.length > 0 && (
              <CommandGroup heading="Go to">
                {pages.slice(0, q.trim() ? 6 : 8).map((p) => {
                  const Icon = NAV_ICONS[p.icon]
                  return (
                    <CommandItem key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}>
                      <Icon />
                      {p.label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {res.items.length > 0 && (
              <CommandGroup heading="Stock items">
                {res.items.map((i) => (
                  <CommandItem key={i.id} value={`item-${i.id}`} onSelect={() => go(`/stock/${i.id}`)}>
                    <BoxIcon />
                    <span className="truncate">{i.name}</span>
                    <span className="num ml-auto text-xs text-muted-foreground">
                      {i.code}, {i.status === "DRAFT" ? "awaiting approval" : `${fmtNum(i.availableQty)} available`}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {res.requests.length > 0 && (
              <CommandGroup heading="Requests">
                {res.requests.map((r) => (
                  <CommandItem key={r.id} value={`req-${r.id}`} onSelect={() => go(`/requests/${r.id}`)}>
                    <FileTextIcon />
                    <span className="truncate">{r.title}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="num text-xs text-muted-foreground">{r.number}</span>
                      <StatusBadge status={r.status as ReqStatus} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {res.employees.length > 0 && (
              <CommandGroup heading="Employees">
                {res.employees.map((e) => (
                  <CommandItem key={e.id} value={`emp-${e.id}`} onSelect={() => go(`/employees/${e.id}`)}>
                    <UserRoundIcon />
                    <span className="truncate">{e.name}</span>
                    <span className="num ml-auto text-xs text-muted-foreground">
                      {e.empId}, {fmtNum(e.points)} pts
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {res.events.length > 0 && (
              <CommandGroup heading="Events">
                {res.events.map((e) => (
                  <CommandItem key={e.id} value={`ev-${e.id}`} onSelect={() => go(`/events/${e.id}`)}>
                    <CalendarDaysIcon />
                    <span className="truncate">{e.name}</span>
                    <span className="num ml-auto text-xs text-muted-foreground">
                      {e.code}, {fmtDate(e.date)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </header>
  )
}
