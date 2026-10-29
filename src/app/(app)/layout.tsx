import { Suspense } from "react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { employeeAllowed } from "@/lib/nav"
import { can } from "@/lib/roles"
import { getUser } from "@/lib/server/session"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app/app-sidebar"
import { AssistantPanel } from "@/components/app/assistant-panel"
import { NavProgress } from "@/components/app/nav-progress"
import { Topbar } from "@/components/app/topbar"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect("/login")
  const path = (await headers()).get("x-pathname") ?? "/"
  // One-time passwords must be replaced before anything else.
  if (user.mustChangePw && user.via !== "sso" && path !== "/profile") redirect("/profile?first=1")
  // Employee accounts only see their own portal.
  if (user.role === "EMPLOYEE" && !employeeAllowed(path)) redirect("/me")

  // The three badge counts run as one round trip to the database.
  const [counts] =
    user.role === "EMPLOYEE"
      ? [{ approvals: 0, mine: 0, rewardsDue: 0 }]
      : await prisma.$queryRaw<{ approvals: number; mine: number; rewardsDue: number }[]>`
          SELECT
            (SELECT count(*)::int FROM "Request" WHERE status = 'SUBMITTED' AND "createdById" <> ${user.id} AND ${can(user.role, "request:approve")}) AS approvals,
            (SELECT count(*)::int FROM "Request" WHERE "createdById" = ${user.id} AND status IN ('DRAFT', 'REJECTED')) AS mine,
            (SELECT count(*)::int FROM "RewardEarned" WHERE status = 'DUE' AND ${can(user.role, "rewards:operate")}) AS "rewardsDue"`
  const open = (await cookies()).get("sidebar_state")?.value !== "false"
  return (
    <SidebarProvider defaultOpen={open} className="flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to main content
      </a>
      <Suspense>
        <NavProgress />
      </Suspense>
      <Topbar user={user} />
      <div className="flex flex-1 pt-(--header-height)">
        <AppSidebar role={user.role} counts={counts} />
        <SidebarInset className="min-w-0">
          <div id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 scroll-mt-16 px-4 py-5 outline-none md:px-7 md:py-6">
            {children}
          </div>
        </SidebarInset>
      </div>
      <AssistantPanel name={user.name} />
    </SidebarProvider>
  )
}
