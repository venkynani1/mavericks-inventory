import { cookies } from "next/headers"
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
  const [approvals, mine] = await Promise.all([
    can(user.role, "request:approve") ? prisma.request.count({ where: { status: "SUBMITTED", createdById: { not: user.id } } }) : 0,
    prisma.request.count({ where: { createdById: user.id, status: { in: ["DRAFT", "REJECTED"] } } }),
  ])
  const open = (await cookies()).get("sidebar_state")?.value !== "false"
  return (
    <SidebarProvider defaultOpen={open}>
      <AppSidebar role={user.role} counts={{ approvals, mine }} />
      <SidebarInset className="min-w-0">
        <Topbar user={user} />
        <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
