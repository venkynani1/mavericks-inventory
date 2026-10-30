"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ActivityIcon,
  ArrowDownToLineIcon,
  ArrowLeftRightIcon,
  AwardIcon,
  BoxesIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileClockIcon,
  GiftIcon,
  HouseIcon,
  MedalIcon,
  PackageOpenIcon,
  ScrollTextIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TrophyIcon,
  UserRoundIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { navFor, type NavIcon, type NavItem } from "@/lib/nav"
import { ROLE_LABEL, type Role } from "@/lib/roles"
import { cn } from "@/lib/utils"

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: HouseIcon,
  items: BoxesIcon,
  movements: ArrowLeftRightIcon,
  count: ClipboardListIcon,
  inward: ArrowDownToLineIcon,
  distribution: PackageOpenIcon,
  requests: FileClockIcon,
  approvals: ClipboardCheckIcon,
  events: CalendarDaysIcon,
  employees: UsersRoundIcon,
  leaderboard: TrophyIcon,
  rewards: GiftIcon,
  reports: ChartColumnIcon,
  users: UsersIcon,
  rules: SlidersHorizontalIcon,
  rewardRules: AwardIcon,
  masters: SettingsIcon,
  audit: ScrollTextIcon,
  system: ActivityIcon,
  me: UserRoundIcon,
  assistant: SparklesIcon,
  prizes: MedalIcon,
}

export type NavCounts = { approvals: number; mine: number; rewardsDue: number; prizesDue: number }

export function AppSidebar({ role, counts }: { role: Role; counts: NavCounts }) {
  const pathname = usePathname()
  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"))

  return (
    <Sidebar collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]! border-r">
      <SidebarContent className="gap-0 py-2">
        {navFor(role).map((g, gi) => (
          <SidebarGroup key={g.label || gi} className="py-1">
            {g.label && <SidebarGroupLabel className="h-7 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {g.items.map((i) => {
                  const Icon = NAV_ICONS[i.icon]
                  const n = i.badge ? counts[i.badge] : 0
                  const active = isActive(i)
                  return (
                    <SidebarMenuItem key={i.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={i.label}
                        className={cn("h-8 font-normal", active && "relative font-medium before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary")}
                      >
                        <Link href={i.href}>
                          <Icon />
                          <span>{i.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {n > 0 && (
                        <SidebarMenuBadge className="num rounded-full bg-sidebar-primary px-1.5 text-[11px] text-sidebar-primary-foreground! peer-data-[active=true]/menu-button:text-sidebar-primary-foreground!">
                          {n > 99 ? "99+" : n}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t px-4 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        <span>
          Signed in as <span className="font-medium text-foreground">{ROLE_LABEL[role]}</span>
        </span>
      </SidebarFooter>
    </Sidebar>
  )
}
