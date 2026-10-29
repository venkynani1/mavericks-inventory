import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { employeeOverview } from "@/lib/server/employee-data"
import { myEmployee } from "@/lib/server/portal"
import { fmtDate, fmtNum } from "@/lib/utils"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { EventsAttendedPanel } from "@/components/app/employee-sections"
import { CategoryBadge } from "@/components/app/rewards-display"
import { PortalUnlinked } from "@/components/app/portal-unlinked"

export const metadata: Metadata = { title: "Events" }

export default async function MyEvents() {
  const { employeeId } = await myEmployee()
  const data = employeeId ? await employeeOverview(employeeId) : null
  if (!data) return <PortalUnlinked />
  const upcoming = await prisma.event.findMany({ where: { status: "PLANNED", date: { gte: new Date(Date.now() - 86400_000) } }, include: { eventType: true }, orderBy: { date: "asc" }, take: 20 })
  return (
    <>
      <PageHeader title="Events" description="Upcoming events you can attend to earn points, and the ones you've been to." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="h-fit overflow-hidden">
          <PanelHeader title={`Upcoming (${upcoming.length})`} />
          {upcoming.length ? (
            <ul className="divide-y">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="num text-xs text-muted-foreground">{fmtDate(e.date)}{e.location ? `, ${e.location}` : ""}</span>
                  </div>
                  <CategoryBadge category={e.eventType.category} className="hidden sm:inline-flex" />
                  <span className="num w-16 text-right text-sm font-semibold">+{fmtNum(e.points ?? e.eventType.points)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing scheduled yet. Check back soon.</p>
          )}
        </Panel>
        <EventsAttendedPanel data={data} />
      </div>
    </>
  )
}
