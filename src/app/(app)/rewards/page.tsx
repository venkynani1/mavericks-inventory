import type { Metadata } from "next"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { CheckCircle2Icon, GiftIcon, HourglassIcon, SettingsIcon, TruckIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { requirePermission } from "@/lib/server/session"
import { fmtDate, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader, Panel } from "@/components/app/page-header"
import { SearchFilter, Segmented, SelectFilter } from "@/components/app/filters"
import { Pager } from "@/components/app/pager"
import { Kpi, RewardStatusBadge } from "@/components/app/rewards-display"
import { RewardsWorklist } from "@/components/app/rewards-forms"

export const metadata: Metadata = { title: "Rewards" }
const PAGE = 100
type SP = { q?: string; view?: string; milestone?: string; page?: string }

export default async function RewardsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("rewards:view")
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const view = (["DUE", "IN_PROGRESS", "ISSUED", "CANCELLED"].includes(sp.view ?? "") ? sp.view : "DUE") as "DUE"
  const where: Prisma.RewardEarnedWhereInput = { status: view }
  if (sp.milestone) where.threshold = Number(sp.milestone)
  if (sp.q) where.employee = { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { empId: { contains: sp.q } }] }

  const [rows, total, counts, milestones, items] = await Promise.all([
    prisma.rewardEarned.findMany({
      where,
      include: { employee: true, line: { include: { stockItem: { select: { name: true } }, request: { select: { id: true, number: true, status: true } } } } },
      orderBy: view === "DUE" ? [{ earnedAt: "asc" }] : [{ issuedAt: "desc" }, { earnedAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.rewardEarned.count({ where }),
    prisma.rewardEarned.groupBy({ by: ["status"], _count: true }),
    prisma.rewardMilestone.findMany({ orderBy: { threshold: "asc" }, include: { stockItem: { select: { id: true, name: true } } } }),
    prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, availableQty: true }, orderBy: { name: "asc" } }),
  ])
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0
  const ms = new Map(milestones.map((m) => [m.threshold, m]))
  const canOperate = can(user.role, "rewards:operate")

  return (
    <>
      <PageHeader
        title="Rewards"
        description="People who crossed a points milestone. Hand out their goodies through a distribution; once it's approved they show as issued."
        actions={
          can(user.role, "rewards:configure") && (
            <Button variant="outline" asChild>
              <Link href="/admin/rewards">
                <SettingsIcon data-icon="inline-start" />
                Milestone goodies
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Due" value={fmtNum(n("DUE"))} hint="Earned, not yet handed out" icon={<GiftIcon />} tone="reward" href="/rewards" />
        <Kpi label="In approval" value={fmtNum(n("IN_PROGRESS"))} hint="On a distribution request" icon={<HourglassIcon />} tone="warn" href="/rewards?view=IN_PROGRESS" />
        <Kpi label="Issued" value={fmtNum(n("ISSUED"))} hint="Goodie handed over" icon={<CheckCircle2Icon />} tone="good" href="/rewards?view=ISSUED" />
        <Kpi label="Goodies set" value={`${milestones.filter((m) => m.active && m.stockItemId).length} of ${milestones.filter((m) => m.active).length}`} hint="Milestones with a goodie chosen" icon={<TruckIcon />} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          param="view"
          options={[
            { value: "DUE", label: "Due", count: n("DUE") },
            { value: "IN_PROGRESS", label: "In approval", count: n("IN_PROGRESS") },
            { value: "ISSUED", label: "Issued", count: n("ISSUED") },
            { value: "CANCELLED", label: "Cancelled", count: n("CANCELLED") },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SelectFilter param="milestone" label="Milestone" allLabel="All milestones" options={milestones.filter((m) => m.active).map((m) => ({ value: String(m.threshold), label: `${fmtNum(m.threshold)} points` }))} />
          <SearchFilter placeholder="Search name or ID…" />
        </div>
      </div>
      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><GiftIcon /></EmptyMedia>
              <EmptyTitle>{view === "DUE" ? "No rewards waiting" : "Nothing here"}</EmptyTitle>
              <EmptyDescription>{view === "DUE" ? "When someone crosses a milestone after an event, they appear here." : "Try another tab or clear the filters."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : view === "DUE" ? (
          <RewardsWorklist
            canOperate={canOperate}
            items={items}
            rows={rows.map((r) => {
              const m = ms.get(r.threshold)
              return { id: r.id, empId: r.employee.empId, name: r.employee.name, department: r.employee.department, location: r.employee.location, threshold: r.threshold, title: r.title, earnedAt: r.earnedAt.toISOString(), goodieId: m?.stockItem?.id ?? null, goodie: m?.stockItem?.name ?? null, goodieQty: m?.quantity ?? null }
            })}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Employee</TableHead>
                <TableHead>Milestone</TableHead>
                <TableHead className="hidden md:table-cell">Goodie</TableHead>
                <TableHead className="hidden sm:table-cell">Request</TableHead>
                <TableHead className="hidden lg:table-cell">{view === "ISSUED" ? "Issued" : "Earned"}</TableHead>
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
                  <TableCell className="num">{fmtNum(r.threshold)}{r.cycle > 1 && <span className="text-xs text-muted-foreground"> (cycle {r.cycle})</span>}</TableCell>
                  <TableCell className="hidden md:table-cell">{r.line?.stockItem.name ?? <span className="text-muted-foreground">{r.note ?? "—"}</span>}</TableCell>
                  <TableCell className="hidden sm:table-cell">{r.line ? <Link href={`/requests/${r.line.request.id}`} className="num text-sm hover:text-primary">{r.line.request.number}</Link> : "—"}</TableCell>
                  <TableCell className="num hidden text-muted-foreground lg:table-cell">{fmtDate(view === "ISSUED" ? r.issuedAt : r.earnedAt)}</TableCell>
                  <TableCell className="pr-5"><RewardStatusBadge status={r.status} staffView /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager page={page} pageSize={PAGE} total={total} params={{ q: sp.q, view: sp.view, milestone: sp.milestone }} path="/rewards" />
      </Panel>
    </>
  )
}
