import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, BanIcon, CalendarIcon, GiftIcon, MapPinIcon, QrCodeIcon, TrophyIcon, UserIcon } from "lucide-react"
import { awardPositions, prizeText } from "@/lib/server/awards"
import { AwardDialog, CancelAward, SheetUploadDialog } from "@/components/app/prize-forms"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { setEventStatus } from "@/app/actions/rewards"
import { requirePermission } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { ConfirmAction } from "@/components/app/confirm-action"
import { AwardStatusBadge, CategoryBadge, EventStatusBadge, POSITION_TONE } from "@/components/app/rewards-display"
import { AttendeesAdder, EventDialog, RemoveAttendee } from "@/components/app/rewards-forms"
import { EventGoodiesDialog, ReturnGoodiesDialog } from "@/components/app/store-forms"
import { StatusBadge } from "@/components/app/status-badge"
import { eventAllocation, eventPassed, eventVouchers } from "@/lib/server/event-goodies"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await prisma.event.findUnique({ where: { id: (await params).id }, select: { name: true } })
  return { title: e?.name ?? "Event" }
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("rewards:view")
  const { id } = await params
  const [settings, event, types, positions, items] = await Promise.all([
    getSettings(),
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
  const [alloc, vouchers, goodieRequests] = await Promise.all([
    eventAllocation(prisma, event.id),
    eventVouchers(prisma, event.id),
    prisma.request.findMany({ where: { eventId: event.id, status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" }, select: { id: true, number: true, type: true, status: true, currentLevel: true, requiredLevel: true, totalQty: true, createdAt: true } }),
  ])
  const passed = eventPassed(event.date)
  const canRequest = can(user.role, "request:create")
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
              <PanelHeader title="Mark attendance" description={`Each person gets ${fmtNum(pts)} points.${settings.rewardMode === "milestones" ? " Milestones they cross show up in Rewards." : " They can spend them in the points store."}`} />
              <AttendeesAdder eventId={event.id} disabled={event.status === "CANCELLED"} />
            </Panel>
          )}
          <Panel className="overflow-hidden">
            <PanelHeader
              title={<span className="inline-flex items-center gap-2"><GiftIcon className="size-4 text-primary" />Event goodies</span>}
              description={passed ? "Goodies for an event are approved before it. This event has happened, so new requests are closed; unused goodies can be returned." : "Ask for the goodies this event needs. The manager approves before the event and stock goes down at approval. Goodie prizes come from these."}
              actions={
                canRequest &&
                event.status !== "CANCELLED" && (
                  <>
                    {alloc.some((a) => a.approved > 0) && can(user.role, "rewards:operate") && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/events/${event.id}/desk`}><QrCodeIcon data-icon="inline-start" />Goodies desk (QR){event.claimOpen ? ": open" : ""}</Link>
                      </Button>
                    )}
                    {alloc.some((a) => a.remaining > 0) && <ReturnGoodiesDialog eventId={event.id} rows={alloc} />}
                    {!passed && <EventGoodiesDialog eventId={event.id} eventName={event.name} items={items} />}
                  </>
                )
              }
            />
            {alloc.length || vouchers.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Goodie</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Waiting</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Prizes</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Collected (QR)</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Returned</TableHead>
                    <TableHead className="pr-5 text-right">Left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alloc.map((a) => (
                    <TableRow key={a.stockItemId}>
                      <TableCell className="pl-5"><Link href={`/stock/${a.stockItemId}`} className="hover:text-primary">{a.name}</Link></TableCell>
                      <TableCell className="num text-right font-medium">{fmtNum(a.approved)}</TableCell>
                      <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{a.waiting ? fmtNum(a.waiting) : "—"}</TableCell>
                      <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{a.prizes ? fmtNum(a.prizes) : "—"}</TableCell>
                      <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{a.collected ? fmtNum(a.collected) : "—"}{a.claimsWaiting ? ` (+${a.claimsWaiting})` : ""}</TableCell>
                      <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{a.returned ? fmtNum(a.returned) : "—"}</TableCell>
                      <TableCell className="num pr-5 text-right font-semibold">{fmtNum(a.remaining)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">{passed ? "No goodies were approved for this event." : "No goodies requested yet."}</p>
            )}
            {vouchers.length > 0 && (
              <div className="border-t">
                <p className="px-5 pt-3 text-sm font-medium">Amazon vouchers</p>
                <ul className="divide-y text-sm">
                  {vouchers.map((v) => (
                    <li key={`${v.provider}${v.denomination}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2">
                      <span className="flex-1">{v.provider}, ₹{fmtNum(v.denomination)} each</span>
                      <span className="num text-muted-foreground">{fmtNum(v.approved)} approved{v.waiting ? `, ${fmtNum(v.waiting)} waiting` : ""}</span>
                      <span className="num text-muted-foreground">{fmtNum(v.given)} given to winners</span>
                      <span className="num font-semibold">{fmtNum(v.left)} left</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {goodieRequests.length > 0 && (
              <ul className="divide-y border-t text-sm">
                {goodieRequests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <Link href={`/requests/${r.id}`} className="num font-medium hover:text-primary">{r.number}</Link>
                    <span className="text-muted-foreground">{r.type === "RECEIPT" ? "Return to stock" : "Goodies request"}, {fmtNum(r.totalQty)} units</span>
                    <StatusBadge className="ml-auto" status={r.status} level={r.currentLevel} required={r.requiredLevel} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel className="overflow-hidden">
            <PanelHeader
              title={<span className="inline-flex items-center gap-2"><TrophyIcon className="size-4 text-reward" />Winners and prizes</span>}
              description="Amazon vouchers, goodies or other prizes for the top performers. Goodie prizes are handed out from the Prizes page, straight from this event's approved goodies when there are enough."
              actions={
                canOperate &&
                event.status !== "CANCELLED" && (
                  <>
                    <SheetUploadDialog kind="winners" eventId={event.id} />
                    <AwardDialog eventId={event.id} positions={positions.filter((p) => p.active).map((p) => ({ name: p.name, bonusPoints: p.bonusPoints }))} items={items} />
                  </>
                )
              }
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
