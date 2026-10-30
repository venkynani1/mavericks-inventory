import type { Metadata } from "next"
import Link from "next/link"
import { Prisma } from "@prisma/client"
import { DownloadIcon, UsersRoundIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { requirePermission } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader, Panel } from "@/components/app/page-header"
import { SearchFilter, Segmented, SelectFilter } from "@/components/app/filters"
import { Pager } from "@/components/app/pager"
import { PointsProgress } from "@/components/app/rewards-display"
import { EmployeeDialog } from "@/components/app/rewards-forms"
import { SheetUploadDialog } from "@/components/app/prize-forms"

export const metadata: Metadata = { title: "Employees and points" }
const PAGE = 50
type SP = { q?: string; view?: string; dept?: string; sort?: string; page?: string }

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("rewards:view")
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const settings = await getSettings()
  const view = sp.view ?? "active"
  const where: Prisma.EmployeeWhereInput = {}
  if (view === "active") where.active = true
  if (view === "earning") Object.assign(where, { active: true, points: { gt: 0 } })
  if (view === "due") where.rewards = { some: { status: "DUE" } }
  if (view === "inactive") where.active = false
  if (sp.dept) where.department = sp.dept
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { empId: { contains: sp.q } }, { email: { contains: sp.q, mode: "insensitive" } }]
  const orderBy: Prisma.EmployeeOrderByWithRelationInput[] = sp.sort === "name" ? [{ name: "asc" }] : [{ points: "desc" }, { name: "asc" }]

  const [emps, total, depts, counts] = await Promise.all([
    prisma.employee.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, include: { _count: { select: { attendance: true, rewards: { where: { status: "DUE" } } } } } }),
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where: { department: { not: null } }, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } }),
    prisma.$queryRaw<{ active: number; earning: number; due: number; inactive: number }[]>`
      SELECT count(*) FILTER (WHERE active)::int AS active,
             count(*) FILTER (WHERE active AND points > 0)::int AS earning,
             (SELECT count(DISTINCT "employeeId")::int FROM "RewardEarned" WHERE status = 'DUE') AS due,
             count(*) FILTER (WHERE NOT active)::int AS inactive
      FROM "Employee"`,
  ])
  const c = counts[0]
  const start = (page - 1) * PAGE

  return (
    <>
      <PageHeader
        title="Employees and points"
        description={`Everyone who attends events or receives goodies. A goodie is earned every ${fmtNum(settings.rewards.step)} points, up to ${fmtNum(settings.rewards.cap)}.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/reports/points?format=xlsx`}>
                <DownloadIcon data-icon="inline-start" />
                Export
              </a>
            </Button>
            {(can(user.role, "rewards:operate") || can(user.role, "rewards:configure")) && (
              <>
                <SheetUploadDialog kind="employees" />
                <EmployeeDialog />
              </>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          param="view"
          options={[
            { value: "active", label: "Active", count: c.active },
            { value: "earning", label: "With points", count: c.earning },
            { value: "due", label: "Reward due", count: c.due },
            { value: "inactive", label: "Inactive", count: c.inactive },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SelectFilter param="sort" label="Sort" allLabel="Most points" options={[{ value: "name", label: "Name A to Z" }]} className="min-w-36" />
          <SelectFilter param="dept" label="Department" allLabel="All departments" options={depts.map((d) => ({ value: d.department!, label: d.department! }))} />
          <SearchFilter placeholder="Search name, ID or email…" />
        </div>
      </div>
      <Panel className="overflow-hidden">
        {emps.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {sp.sort !== "name" && <TableHead className="w-12 pl-5 text-right">#</TableHead>}
                <TableHead className={sp.sort === "name" ? "pl-5" : ""}>Employee</TableHead>
                <TableHead className="hidden lg:table-cell">Department</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="hidden w-48 md:table-cell">Towards {fmtNum(settings.rewards.cap)}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Events</TableHead>
                <TableHead className="pr-5 text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emps.map((e, i) => (
                <TableRow key={e.id} className="group">
                  {sp.sort !== "name" && <TableCell className="num pl-5 text-right text-muted-foreground">{start + i + 1}</TableCell>}
                  <TableCell className={sp.sort === "name" ? "pl-5" : ""}>
                    <Link href={`/employees/${e.id}`} className="flex flex-col rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <span className="font-medium group-hover:text-primary">{e.name}</span>
                      <span className="num text-xs text-muted-foreground">{e.empId}{e.location ? `, ${e.location}` : ""}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{e.department ?? "—"}</TableCell>
                  <TableCell className="num text-right font-semibold">{fmtNum(e.points)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <PointsProgress points={e.points} rules={settings.rewards} size="sm" />
                  </TableCell>
                  <TableCell className="num hidden text-right sm:table-cell">{e._count.attendance}</TableCell>
                  <TableCell className="num pr-5 text-right">{e._count.rewards ? <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-reward-soft px-2 text-xs font-semibold text-reward">{e._count.rewards}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><UsersRoundIcon /></EmptyMedia>
              <EmptyTitle>No employees match</EmptyTitle>
              <EmptyDescription>Clear the search or filters. Employees are added automatically from attendance sheets.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <Pager page={page} pageSize={PAGE} total={total} params={{ q: sp.q, view: sp.view, dept: sp.dept, sort: sp.sort }} path="/employees" />
      </Panel>
    </>
  )
}
