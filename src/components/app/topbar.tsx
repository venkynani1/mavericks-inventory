"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { useTheme } from "next-themes"
import { BoxIcon, FileTextIcon, KeyRoundIcon, LogOutIcon, MoonIcon, SearchIcon, SunIcon } from "lucide-react"
import { searchEverything } from "@/app/actions/search"
import { logout } from "@/app/actions/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ROLE_LABEL, type Role } from "@/lib/roles"
import { initials } from "@/lib/utils"
import { StatusBadge, type ReqStatus } from "./status-badge"

type Results = Awaited<ReturnType<typeof searchEverything>>

export function Topbar({ user }: { user: { name: string; email: string; role: Role } }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Results>({ items: [], requests: [] })
  const [, start] = useTransition()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName))) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Ask the server only when there's something to search for. An idle server call on every page load
  // was racing with page navigation and occasionally cancelled it.
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setRes({ items: [], requests: [] })
      return
    }
    const t = setTimeout(() => start(async () => setRes(await searchEverything(q))), 180)
    return () => clearTimeout(t)
  }, [q, open])

  const go = (href: string) => {
    setOpen(false)
    setQ("")
    router.push(href)
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-5">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 min-w-0 flex-1 max-w-md items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground outline-none hover:border-input focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SearchIcon className="size-4" />
        <span className="truncate">Search items, codes or request numbers</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Switch light or dark theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <SunIcon className="hidden dark:block" />
          <MoonIcon className="dark:hidden" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Account menu">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="hidden flex-col items-start leading-tight md:flex">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="text-[11px] text-muted-foreground">{ROLE_LABEL[user.role]}</span>
              </span>
            </Button>
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

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Find stock items and requests" className="sm:max-w-xl">
        <Command shouldFilter={false}>
        <CommandInput placeholder="Type an item name, stock code or request number…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{q.trim().length < 2 ? "Type at least two characters." : "Nothing matches that search."}</CommandEmpty>
          {res.items.length > 0 && (
            <CommandGroup heading="Stock items">
              {res.items.map((i) => (
                <CommandItem key={i.id} value={`item-${i.id}-${i.name}`} onSelect={() => go(`/stock/${i.id}`)}>
                  <BoxIcon />
                  <span className="truncate">{i.name}</span>
                  <span className="num ml-auto text-xs text-muted-foreground">
                    {i.code}, {i.status === "DRAFT" ? "awaiting approval" : `${i.availableQty} available`}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {res.requests.length > 0 && (
            <CommandGroup heading="Requests">
              {res.requests.map((r) => (
                <CommandItem key={r.id} value={`req-${r.id}-${r.number}`} onSelect={() => go(`/requests/${r.id}`)}>
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
        </CommandList>
        </Command>
      </CommandDialog>
    </header>
  )
}
