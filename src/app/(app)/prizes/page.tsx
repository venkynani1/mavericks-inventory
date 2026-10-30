import type { Metadata } from "next"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { BadgeCheckIcon, DownloadIcon, GiftIcon, HourglassIcon, TicketIcon, TrophyIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { prizeText } from "@/lib/server/awards"
import { requirePermission } from "@/lib/server/session"
import { fmtDate, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader, Panel } from "@/components/app/page-header"
import { SearchFilter, Segmented } from "@/components/app/filters"
import { Pager } from "@/components/app/pager"
import { AwardStatusBadge, Kpi, POSITION_TONE } from "@/components/app/rewards-display"
import { PrizesWorklist, type PrizeRow } from "@/components/app/prize-forms"

export const metadata: Metadata = { title: "Event prizes" }
const PAGE = 100
type SP = { q?: string; view?: string; page?: string }
const VIEWS = ["goodies", "vouchers", "approval", "issued", "cancelled"] as const

export default async function PrizesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("rewards:view")
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as (typeof VIEWS)[number]) : "goodies"
  const where: Prisma.EventAwardWhereInput =
    view === "goodies" ? { status: "PENDING", kind: "GOODIE" }
    : view === "vouchers" ? { status: "PENDING", kind: { in: ["VOUCHER", "OTHER"] } }
    : view === "approval" ? { status: "IN_APPROVAL" }
    : view === "issued" ? { status: "ISSUED" }
    : { status: "CANCELLED" }
  if (sp.q) where.OR = [{ employee: { name: { contains: sp.q, mode: "insensitive" } } }, { employee: { empId: { contains: sp.q } } }, { event: { name: { contains: sp.q, mode: "insensitive" } } }]

  const since = new Date(Date.now() - 90 * 86400_000)
  const [rows, total, counts, voucherDue, voucherIssued90] = await Promise.all([
    prisma.eventAward.findMany({
      where,
      include: { employee: true, event: true, stockItem: { select: { name: true, availableQty: true } }, line: { include: { request: { select: { id: true, number: true } } } } },
      orderBy: view === "issued" ? [{ issuedAt: "desc" }] : [{ createdAt: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.eventAward.count({ where }),
    prisma.$queryRaw<{ goodies: number; vouchers: number; approval: number; issued: number; cancelled: number }[]>`
      SELECT count(*) FILTER (WHERE status = 'PENDING' AND kind = 'GOODIE')::int AS goodies,
             count(*) FILTER (WHERE status = 'PENDING' AND kind <> 'GOODIE')::int AS vouchers,
             count(*) FILTER (WHERE status = 'IN_APPROVAL')::int AS approval,
             count(*) FILTER (WHERE status = 'ISSUED')::int AS issued,
             count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
      FROM "EventAward"`,
    prisma.eventAward.aggregate({ where: { status: "PENDING", kind: "VOUCHER" }, _sum: { voucherAmount: true } }),
    prisma.eventAward.aggregate({ where: { status: "ISSUED", kind: "VOUCHER", issuedAt: { gte: since } }, _sum: { voucherAmount: true }, _count: true }),
  ])
  const c = counts[0]
  const canOperate = can(user.role, "rewards:operate")
  const worklist = view === "goodies" || view === "vouchers"
  // Units of each goodie needed by the pending goodie prizes, to warn when stock is short.
  const need = new Map<string, number>()
  if (view === "goodies") for (const r of rows) if (r.stockItemId) need.set(r.stockItemId, (need.get(r.stockItemId) ?? 0) + r.quantity)

  return (
    <>
      <PageHeader
        title="Event prizes"
        description="Winners, runners-up and top performers from events. Goodies go out through an approved distribution; vouchers are marked issued with their order reference."
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/reports/prizes?format=xlsx`}>
              <DownloadIcon data-icon="inline-start" />
              Export for finance
            </a>
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Goodies to hand out" value={fmtNum(c.goodies)} icon={<GiftIcon />} tone="reward" href="/prizes" />
        <Kpi label="Vouchers to send" value={fmtNum(c.vouchers)} hint={voucherDue._sum.voucherAmount ? `₹${fmtNum(voucherDue._sum.voucherAmount)} in total` : undefined} icon={<TicketIcon />} tone="warn" href="/prizes?view=vouchers" />
        <Kpi label="In approval" value={fmtNum(c.approval)} icon={<HourglassIcon />} href="/prizes?view=approval" />
        <Kpi label="Vouchers sent, 90 days" value={`₹${fmtNum(voucherIssued90._sum.voucherAmount ?? 0)}`} hint={`${fmtNum(voucherIssued90._count)} vouchers`} icon={<BadgeCheckIcon />} tone="good" href="/prizes?view=issued" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          param="view"
          options={[
            { value: "goodies", label: "Goodies to hand out", count: c.goodies },
            { value: "vouchers", label: "Vouchers and other", count: c.vouchers },
            { value: "approval", label: "In approval", count: c.approval },
            { value: "issued", label: "Issued", count: c.issued },
            { value: "cancelled", label: "Cancelled", count: c.cancelled },
          ]}
        />
        <div className="ml-auto">
          <SearchFilter placeholder="Employee or event…" />
        </div>
      </div>
      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><TrophyIcon /></EmptyMedia>
              <EmptyTitle>Nothing here</EmptyTitle>
              <EmptyDescription>Record winners on an event&apos;s page (Events, open the event, Add winner). Their prizes appear here to hand out.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : worklist ? (
          <PrizesWorklist
            canOperate={canOperate}
            mode={view === "goodies" ? "goodies" : "vouchers"}
            rows={rows.map(
              (r): PrizeRow => ({
                id: r.id, empId: r.employee.empId, name: r.employee.name, department: r.employee.department, position: r.position, kind: r.kind, prize: prizeText(r), event: r.event.name, eventId: r.eventId,
                date: r.event.date.toISOString(), bonus: r.bonusPoints, stockOk: !r.stockItem || r.stockItem.availableQty >= (need.get(r.stockItemId!) ?? 0),
              }),
            )}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Employee</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Prize</TableHead>
                <TableHead className="hidden md:table-cell">Event</TableHead>
                <TableHead className="hidden lg:table-cell">{view === "issued" ? "Issued" : "Reference"}</TableHead>
                <TableHead className="pr-5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-5">
                    <Link href={`/employees/${r.employeeId}`} className="flex flex-col hover:text-primary">
                      <span className="font-medium">{r.employee.name}</span>
                      <span className="num text-xs text-muted-foreground">{r.employee.empId}</span>
                    </Link>
                  </TableCell>
                  <TableCell><span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap ${POSITION_TONE(r.position)}`}>{r.position}</span></TableCell>
                  <TableCell>{prizeText(r)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Link href={`/events/${r.eventId}`} className="hover:text-primary">{r.event.name}</Link>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {r.line ? <Link href={`/requests/${r.line.request.id}`} className="num hover:text-primary">{r.line.request.number}</Link> : (r.voucherRef ?? "—")}
                    {view === "issued" && r.issuedAt && <span className="block num text-xs">{fmtDate(r.issuedAt)}</span>}
                  </TableCell>
                  <TableCell className="pr-5"><AwardStatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager page={page} pageSize={PAGE} total={total} params={{ q: sp.q, view: sp.view }} path="/prizes" />
      </Panel>
    </>
  )
}
