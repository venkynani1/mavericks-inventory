import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { getUser } from "@/lib/server/session"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app/app-sidebar"
import { Topbar } from "@/components/app/topbar"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect("/login")
  // One-time passwords must be replaced before anything else.
  if (user.mustChangePw && (await headers()).get("x-pathname") !== "/profile") redirect("/profile?first=1")
  const [approvals, mine] = await Promise.all([
    can(user.role, "request:approve") ? prisma.request.count({ where: { status: "SUBMITTED", createdById: { not: user.id } } }) : 0,
    prisma.request.count({ where: { createdById: user.id, status: { in: ["DRAFT", "REJECTED"] } } }),
  ])
  const open = (await cookies()).get("sidebar_state")?.value !== "false"
  return (
    <SidebarProvider defaultOpen={open}>
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to main content
      </a>
      <AppSidebar role={user.role} counts={{ approvals, mine }} />
      <SidebarInset className="min-w-0">
        <Topbar user={user} />
        <div id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 scroll-mt-16 px-4 py-6 outline-none md:px-8 md:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
