import type { Metadata } from "next"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { CalendarClockIcon, HourglassIcon, PackageCheckIcon, ShoppingBagIcon, TriangleAlertIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { requirePermission } from "@/lib/server/session"
import { fmtDateTime, fmtNum } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader, Panel } from "@/components/app/page-header"
import { SearchFilter, Segmented } from "@/components/app/filters"
import { Kpi } from "@/components/app/rewards-display"
import { OrderStatusBadge } from "@/components/app/store-display"
import { OrderActions } from "@/components/app/store-forms"

export const metadata: Metadata = { title: "Store orders" }
type SP = { q?: string; view?: string }
const VIEWS = { placed: ["PLACED"], pickup: ["ACCEPTED"], collected: ["COLLECTED"], closed: ["REJECTED", "CANCELLED"] } as const

export default async function RedemptionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("rewards:view")
  const sp = await searchParams
  const view = (sp.view && sp.view in VIEWS ? sp.view : "placed") as keyof typeof VIEWS
  const where: Prisma.RedemptionOrderWhereInput = { status: { in: [...VIEWS[view]] } }
  if (sp.q) where.OR = [{ number: { contains: sp.q, mode: "insensitive" } }, { employee: { name: { contains: sp.q, mode: "insensitive" } } }, { employee: { empId: { contains: sp.q } } }]
  const [rows, counts, pointsSpent, locations] = await Promise.all([
    prisma.redemptionOrder.findMany({
      where,
      include: { employee: true, lines: { include: { stockItem: { select: { availableQty: true } } } } },
      orderBy: view === "placed" ? { createdAt: "asc" } : view === "pickup" ? { pickupAt: "asc" } : { updatedAt: "desc" },
      take: 200,
    }),
    prisma.redemptionOrder.groupBy({ by: ["status"], _count: true }),
    prisma.redemptionOrder.aggregate({ where: { status: { in: ["PLACED", "ACCEPTED", "COLLECTED"] }, createdAt: { gte: new Date(Date.now() - 90 * 86400_000) } }, _sum: { totalPoints: true } }),
    prisma.lookup.findMany({ where: { kind: "LOCATION", active: true }, orderBy: { sortOrder: "asc" }, select: { value: true } }),
  ])
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0
  const canOperate = can(user.role, "rewards:operate")
  const overdue = rows.filter((o) => o.status === "ACCEPTED" && o.pickupAt && o.pickupAt.getTime() < Date.now() - 86400_000).length

  return (
    <>
      <PageHeader title="Store orders" description="Orders employees placed in the points store. Their points were deducted when they ordered. Accept to give a pickup place and time (the goodies leave stock then), or reject to refund the points." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Waiting for you" value={fmtNum(n("PLACED"))} icon={<HourglassIcon />} tone="warn" href="/redemptions" />
        <Kpi label="Ready for pickup" value={fmtNum(n("ACCEPTED"))} hint={overdue ? `${overdue} past their pickup time` : undefined} icon={<CalendarClockIcon />} href="/redemptions?view=pickup" />
        <Kpi label="Collected" value={fmtNum(n("COLLECTED"))} icon={<PackageCheckIcon />} tone="good" href="/redemptions?view=collected" />
        <Kpi label="Points spent, 90 days" value={fmtNum(pointsSpent._sum.totalPoints ?? 0)} icon={<ShoppingBagIcon />} tone="reward" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          param="view"
          options={[
            { value: "placed", label: "New orders", count: n("PLACED") },
            { value: "pickup", label: "Ready for pickup", count: n("ACCEPTED") },
            { value: "collected", label: "Collected", count: n("COLLECTED") },
            { value: "closed", label: "Rejected or cancelled", count: n("REJECTED") + n("CANCELLED") },
          ]}
        />
        <div className="ml-auto">
          <SearchFilter placeholder="Order, employee or ID…" />
        </div>
      </div>
      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ShoppingBagIcon /></EmptyMedia>
              <EmptyTitle>Nothing here</EmptyTitle>
              <EmptyDescription>When employees order goodies with their points, the orders appear here for the team.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Order</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Goodies</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="hidden lg:table-cell">{view === "pickup" ? "Pickup" : view === "placed" ? "Placed" : "Status"}</TableHead>
                {canOperate && (view === "placed" || view === "pickup") && <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const short = o.status === "PLACED" && o.lines.some((l) => l.stockItem.availableQty < l.quantity)
                return (
                  <TableRow key={o.id}>
                    <TableCell className="pl-5 align-top">
                      <span className="num font-medium">{o.number}</span>
                      <span className="block"><OrderStatusBadge status={o.status} /></span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Link href={`/employees/${o.employeeId}`} className="flex flex-col hover:text-primary">
                        <span className="font-medium">{o.employee.name}</span>
                        <span className="num text-xs text-muted-foreground">{o.employee.empId}{o.employee.location ? `, ${o.employee.location}` : ""}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="align-top">
                      <ul className="text-sm">
                        {o.lines.map((l) => <li key={l.id}>{l.name}{l.quantity > 1 ? ` x${l.quantity}` : ""}</li>)}
                      </ul>
                      {o.note && <span className="block text-xs text-muted-foreground">“{o.note}”</span>}
                      {!o.employee.active && <span className="mt-1 flex items-center gap-1 text-xs font-medium text-rejected"><TriangleAlertIcon className="size-3.5" />No longer active in Fusion: don&apos;t hand over</span>}
                      {short && <span className="mt-1 inline-flex items-center gap-1 text-xs text-rejected"><TriangleAlertIcon className="size-3.5" />Not enough in stock</span>}
                      {o.rejectReason && <span className="block text-xs text-rejected">{o.rejectReason}</span>}
                    </TableCell>
                    <TableCell className="num text-right align-top font-semibold">{fmtNum(o.totalPoints)}</TableCell>
                    <TableCell className="num hidden align-top text-sm text-muted-foreground lg:table-cell">
                      {view === "pickup" && o.pickupAt ? (
                        <>
                          <span className="block text-foreground">{fmtDateTime(o.pickupAt)}</span>
                          <span className="block">{o.pickupLocation}</span>
                        </>
                      ) : view === "collected" && o.collectedAt ? (
                        fmtDateTime(o.collectedAt)
                      ) : (
                        fmtDateTime(o.createdAt)
                      )}
                    </TableCell>
                    {canOperate && (view === "placed" || view === "pickup") && (
                      <TableCell className="pr-5 align-top">
                        <OrderActions
                          locations={locations.map((l) => l.value)}
                          order={{ id: o.id, number: o.number, status: o.status, employee: o.employee.name, location: o.employee.location, pickupLocation: o.pickupLocation, pickupAt: o.pickupAt?.toISOString() ?? null, pickupNote: o.pickupNote }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  )
}
