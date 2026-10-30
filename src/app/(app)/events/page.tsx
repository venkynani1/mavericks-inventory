import type { Metadata } from "next"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { CalendarDaysIcon, CalendarCheck2Icon, CalendarClockIcon, UsersRoundIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { requirePermission } from "@/lib/server/session"
import { fmtDate, fmtNum } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader, Panel } from "@/components/app/page-header"
import { SearchFilter, Segmented, SelectFilter } from "@/components/app/filters"
import { Pager } from "@/components/app/pager"
import { CategoryBadge, CATEGORY_LABEL, EventStatusBadge, Kpi } from "@/components/app/rewards-display"
import { EventDialog } from "@/components/app/rewards-forms"
import { EventsUpload } from "@/components/app/prize-forms"

export const metadata: Metadata = { title: "Events" }
const PAGE = 30
type SP = { q?: string; view?: string; category?: string; page?: string }

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("rewards:view")
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const view = sp.view ?? "all"
  const where: Prisma.EventWhereInput = {}
  if (view === "upcoming") where.status = "PLANNED"
  if (view === "completed") where.status = "COMPLETED"
  if (view === "cancelled") where.status = "CANCELLED"
  if (sp.category && sp.category in CATEGORY_LABEL) where.eventType = { category: sp.category as "TECH" }
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { code: { contains: sp.q, mode: "insensitive" } }, { location: { contains: sp.q, mode: "insensitive" } }]
  const since = new Date(Date.now() - 90 * 86400_000)

  const [events, total, types, stats] = await Promise.all([
    prisma.event.findMany({ where, include: { eventType: true, _count: { select: { attendance: true } } }, orderBy: [{ date: view === "upcoming" ? "asc" : "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
    prisma.event.count({ where }),
    prisma.eventType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.$queryRaw<{ upcoming: number; completed90: number; attend90: number; points90: number; all: number; completed: number; cancelled: number }[]>`
      SELECT
        (SELECT count(*)::int FROM "Event" WHERE status = 'PLANNED') AS upcoming,
        (SELECT count(*)::int FROM "Event" WHERE status = 'COMPLETED' AND date >= ${since}) AS "completed90",
        (SELECT count(*)::int FROM "Attendance" a JOIN "Event" e ON e.id = a."eventId" WHERE e.date >= ${since}) AS "attend90",
        (SELECT coalesce(sum(a."pointsAwarded"), 0)::int FROM "Attendance" a JOIN "Event" e ON e.id = a."eventId" WHERE e.date >= ${since}) AS "points90",
        (SELECT count(*)::int FROM "Event") AS all,
        (SELECT count(*)::int FROM "Event" WHERE status = 'COMPLETED') AS completed,
        (SELECT count(*)::int FROM "Event" WHERE status = 'CANCELLED') AS cancelled`,
  ])
  const s = stats[0]
  const canOperate = can(user.role, "rewards:operate")

  return (
    <>
      <PageHeader
        title="Events"
        description="Tech talks, workshops, hackathons and celebrations. Marking someone present credits the event's points to them straight away."
        actions={
          canOperate && (
            <>
              <EventsUpload />
              <EventDialog types={types.map((t) => ({ id: t.id, name: t.name, category: t.category, points: t.points }))} />
            </>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Upcoming" value={fmtNum(s.upcoming)} icon={<CalendarClockIcon />} href="/events?view=upcoming" />
        <Kpi label="Held, last 90 days" value={fmtNum(s.completed90)} icon={<CalendarCheck2Icon />} tone="good" />
        <Kpi label="Attendances, 90 days" value={fmtNum(s.attend90)} icon={<UsersRoundIcon />} />
        <Kpi label="Points given, 90 days" value={fmtNum(s.points90)} icon={<CalendarDaysIcon />} tone="reward" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          param="view"
          options={[
            { value: "all", label: "All", count: s.all },
            { value: "upcoming", label: "Upcoming", count: s.upcoming },
            { value: "completed", label: "Completed", count: s.completed },
            { value: "cancelled", label: "Cancelled", count: s.cancelled },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SelectFilter param="category" label="Category" allLabel="All categories" options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
          <SearchFilter placeholder="Search event, code or location…" />
        </div>
      </div>
      <Panel className="overflow-hidden">
        {events.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Event</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Attended</TableHead>
                <TableHead className="hidden pr-5 md:table-cell">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id} className="group">
                  <TableCell className="max-w-0 pl-5 sm:max-w-none">
                    <Link href={`/events/${e.id}`} className="flex flex-col rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <span className="truncate font-medium group-hover:text-primary">{e.name}</span>
                      <span className="num text-xs text-muted-foreground">{e.code}<span className="md:hidden">, {fmtDate(e.date)}</span></span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CategoryBadge category={e.eventType.category} />
                  </TableCell>
                  <TableCell className="num hidden md:table-cell">{fmtDate(e.date)}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{e.location ?? "—"}</TableCell>
                  <TableCell className="num text-right font-medium">{fmtNum(e.points ?? e.eventType.points)}</TableCell>
                  <TableCell className="num hidden text-right sm:table-cell">{e._count.attendance ? fmtNum(e._count.attendance) : "—"}</TableCell>
                  <TableCell className="hidden pr-5 md:table-cell">
                    <EventStatusBadge status={e.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDaysIcon />
              </EmptyMedia>
              <EmptyTitle>No events here</EmptyTitle>
              <EmptyDescription>{sp.q || sp.category ? "Clear the filters to see every event." : canOperate ? "Create an event, then mark attendees when it's done." : "Executives create events and record attendance."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <Pager page={page} pageSize={PAGE} total={total} params={{ q: sp.q, view: sp.view, category: sp.category }} path="/events" />
      </Panel>
    </>
  )
}
