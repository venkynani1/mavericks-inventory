import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, BanIcon, CalendarIcon, MapPinIcon, TrophyIcon, UserIcon } from "lucide-react"
import { awardPositions, prizeText } from "@/lib/server/awards"
import { AwardDialog, CancelAward } from "@/components/app/prize-forms"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { setEventStatus } from "@/app/actions/rewards"
import { requirePermission } from "@/lib/server/session"
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { ConfirmAction } from "@/components/app/confirm-action"
import { AwardStatusBadge, CategoryBadge, EventStatusBadge, POSITION_TONE } from "@/components/app/rewards-display"
import { AttendeesAdder, EventDialog, RemoveAttendee } from "@/components/app/rewards-forms"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await prisma.event.findUnique({ where: { id: (await params).id }, select: { name: true } })
  return { title: e?.name ?? "Event" }
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("rewards:view")
  const { id } = await params
  const [event, types, positions, items] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        eventType: true,
        attendance: { include: { employee: true }, orderBy: { createdAt: "desc" } },
        awards: { where: { status: { not: "CANCELLED" } }, include: { employee: true, stockItem: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.eventType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    awardPositions(),
    prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, availableQty: true }, orderBy: { name: "asc" } }),
  ])
  if (!event) notFound()
  const pts = event.points ?? event.eventType.points
  const canOperate = can(user.role, "rewards:operate")
  const locked = event.attendance.length > 0
  const typeOpts = types.map((t) => ({ id: t.id, name: t.name, category: t.category, points: t.points }))
  if (!typeOpts.some((t) => t.id === event.eventTypeId)) typeOpts.push({ id: event.eventType.id, name: event.eventType.name, category: event.eventType.category, points: event.eventType.points })

  return (
    <>
      <Link href="/events" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Events
      </Link>
      <PageHeader
        title={event.name}
        actions={
          canOperate && (
            <>
              {event.status !== "CANCELLED" && (
                <EventDialog
                  types={typeOpts}
                  locked={locked}
                  event={{ id: event.id, name: event.name, eventTypeId: event.eventTypeId, date: event.date.toISOString().slice(0, 10), location: event.location ?? "", organizer: event.organizer ?? "", description: event.description ?? "", points: event.points ?? "" }}
                />
              )}
              {event.status !== "CANCELLED" && !locked && (
                <ConfirmAction
                  trigger={
                    <Button variant="outline">
                      <BanIcon data-icon="inline-start" />
                      Cancel event
                    </Button>
                  }
                  title="Cancel this event?"
                  description="It stays in the list as cancelled. No points can be recorded against it."
                  confirmLabel="Cancel event"
                  destructive
                  action={setEventStatus.bind(null, event.id, "CANCELLED")}
                />
              )}
              {event.status === "CANCELLED" && (
                <ConfirmAction trigger={<Button variant="outline">Reopen</Button>} title="Reopen this event?" description="It goes back to planned." confirmLabel="Reopen" action={setEventStatus.bind(null, event.id, "PLANNED")} />
              )}
            </>
          )
        }
      >
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="num font-medium text-foreground">{event.code}</span>
          <EventStatusBadge status={event.status} />
          <CategoryBadge category={event.eventType.category} />
          <span className="inline-flex items-center gap-1.5"><CalendarIcon className="size-4" />{fmtDate(event.date)}</span>
          {event.location && <span className="inline-flex items-center gap-1.5"><MapPinIcon className="size-4" />{event.location}</span>}
          {event.organizer && <span className="inline-flex items-center gap-1.5"><UserIcon className="size-4" />{event.organizer}</span>}
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {canOperate && (
            <Panel>
              <PanelHeader title="Mark attendance" description={`Each person gets ${fmtNum(pts)} points. Milestones they cross show up in Rewards.`} />
              <AttendeesAdder eventId={event.id} disabled={event.status === "CANCELLED"} />
            </Panel>
          )}
          <Panel className="overflow-hidden">
            <PanelHeader
              title={<span className="inline-flex items-center gap-2"><TrophyIcon className="size-4 text-reward" />Winners and prizes</span>}
              description="Amazon vouchers, goodies or other prizes for the top performers. Goodies go out through an approved distribution from the Prizes page."
              actions={canOperate && event.status !== "CANCELLED" && <AwardDialog eventId={event.id} positions={positions.filter((p) => p.active).map((p) => ({ name: p.name, bonusPoints: p.bonusPoints }))} items={items} />}
            />
            {event.awards.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Position</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Prize</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Bonus</TableHead>
                    <TableHead>Status</TableHead>
                    {canOperate && <TableHead className="w-12 pr-5"><span className="sr-only">Cancel</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {event.awards.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-5"><span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap ${POSITION_TONE(a.position)}`}>{a.position}</span></TableCell>
                      <TableCell>
                        <Link href={`/employees/${a.employeeId}`} className="flex flex-col hover:text-primary">
                          <span className="font-medium">{a.employee.name}</span>
                          <span className="num text-xs text-muted-foreground">{a.employee.empId}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {prizeText(a)}
                        {a.description && a.kind !== "OTHER" && <span className="block text-xs text-muted-foreground">{a.description}</span>}
                      </TableCell>
                      <TableCell className="num hidden text-right sm:table-cell">{a.bonusPoints ? `+${fmtNum(a.bonusPoints)}` : "—"}</TableCell>
                      <TableCell><AwardStatusBadge status={a.status} /></TableCell>
                      {canOperate && <TableCell className="pr-5">{a.status === "PENDING" && <CancelAward id={a.id} label={`${a.position}: ${a.employee.name}, ${prizeText(a)}`} />}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No winners recorded yet.</p>
            )}
          </Panel>
          <Panel className="overflow-hidden">
            <PanelHeader title={`Attendees (${fmtNum(event.attendance.length)})`} actions={event.attendance.length > 0 && <Button variant="outline" size="sm" asChild><a href={`/api/reports/attendance?format=xlsx&event=${event.id}`}>Export</a></Button>} />
            {event.attendance.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Employee</TableHead>
                    <TableHead className="hidden md:table-cell">Department</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead className="hidden sm:table-cell">Recorded</TableHead>
                    {canOperate && <TableHead className="w-12 pr-5"><span className="sr-only">Remove</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {event.attendance.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-5">
                        <Link href={`/employees/${a.employeeId}`} className="flex flex-col hover:text-primary">
                          <span className="font-medium">{a.employee.name}</span>
                          <span className="num text-xs text-muted-foreground">{a.employee.empId}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{a.employee.department ?? "—"}</TableCell>
                      <TableCell className="num text-right">+{fmtNum(a.pointsAwarded)}</TableCell>
                      <TableCell className="num hidden text-muted-foreground sm:table-cell">{fmtDateTime(a.createdAt)}</TableCell>
                      {canOperate && (
                        <TableCell className="pr-5">
                          <RemoveAttendee id={a.id} name={a.employee.name} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No one is marked present yet.</p>
            )}
          </Panel>
        </div>
        <aside className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Summary" />
            <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
              <div><dt className="text-muted-foreground">Points each</dt><dd className="num mt-1 text-xl font-semibold">{fmtNum(pts)}</dd></div>
              <div><dt className="text-muted-foreground">Attendees</dt><dd className="num mt-1 text-xl font-semibold">{fmtNum(event.attendance.length)}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Points credited</dt><dd className="num mt-1 text-xl font-semibold">{fmtNum(event.attendance.reduce((s, a) => s + a.pointsAwarded, 0))}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Type</dt><dd className="mt-1">{event.eventType.name}{event.points != null && <span className="text-muted-foreground"> (points overridden from {fmtNum(event.eventType.points)})</span>}</dd></div>
              {event.description && <div className="col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="mt-1 whitespace-pre-line">{event.description}</dd></div>}
            </dl>
          </Panel>
        </aside>
      </div>
    </>
  )
}
