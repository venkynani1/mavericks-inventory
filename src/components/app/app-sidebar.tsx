"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowDownToLineIcon,
  BoxesIcon,
  ChartColumnIcon,
  ClipboardCheckIcon,
  FileClockIcon,
  GaugeIcon,
  PackageOpenIcon,
  ScrollTextIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { can, ROLE_LABEL, type Role } from "@/lib/roles"
import { Brand } from "./brand"

type Item = { href: string; label: string; icon: LucideIcon; badge?: number; show?: boolean; match?: (p: string) => boolean }

export function AppSidebar({ role, counts }: { role: Role; counts: { approvals: number; mine: number } }) {
  const pathname = usePathname()
  const exec = role === "EXECUTIVE"
  const approver = can(role, "request:approve")

  const work: Item[] = [
    { href: "/", label: "Overview", icon: GaugeIcon, match: (p) => p === "/" },
    { href: "/stock", label: "Stock", icon: BoxesIcon },
    { href: "/distributions", label: "Distributions", icon: PackageOpenIcon },
    { href: "/receipts", label: "Stock inward", icon: ArrowDownToLineIcon },
    { href: "/requests", label: exec ? "My requests" : "All requests", icon: FileClockIcon, badge: exec ? counts.mine : undefined, match: (p) => p.startsWith("/requests") },
    { href: "/approvals", label: "Approvals", icon: ClipboardCheckIcon, badge: counts.approvals, show: approver },
    { href: "/reports", label: "Reports", icon: ChartColumnIcon, show: can(role, "report:view") },
  ]
  const admin: Item[] = [
    { href: "/admin/users", label: "Users & roles", icon: UsersIcon },
    { href: "/admin/workflow", label: "Approval rules", icon: SlidersHorizontalIcon },
    { href: "/admin/masters", label: "Master data", icon: SettingsIcon },
  ]
  const audit: Item = { href: "/admin/audit", label: "Audit log", icon: ScrollTextIcon }

  const isActive = (i: Item) => (i.match ? i.match(pathname) : pathname === i.href || pathname.startsWith(i.href + "/"))

  const render = (items: Item[]) =>
    items
      .filter((i) => i.show !== false)
      .map((i) => (
        <SidebarMenuItem key={i.href}>
          <SidebarMenuButton asChild isActive={isActive(i)} tooltip={i.label}>
            <Link href={i.href}>
              <i.icon />
              <span>{i.label}</span>
            </Link>
          </SidebarMenuButton>
          {!!i.badge && <SidebarMenuBadge className="num rounded-full bg-sidebar-primary px-1.5 text-sidebar-primary-foreground! peer-data-[active=true]/menu-button:text-sidebar-primary-foreground!">{i.badge}</SidebarMenuBadge>}
        </SidebarMenuItem>
      ))

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 pt-4 pb-3 group-data-[collapsible=icon]:px-2">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" aria-label="Mavericks Inventory home">
          <Brand inverted className="group-data-[collapsible=icon]:[&>div]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Inventory</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{render(work)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {(role === "ADMIN" || can(role, "audit:view")) && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{render([...(role === "ADMIN" ? admin : []), audit])}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
        Signed in as {ROLE_LABEL[role]}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
