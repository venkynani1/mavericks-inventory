import type { Metadata } from "next"
import Link from "next/link"
import { TrophyIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { departmentBoard, leaderboard, type Board } from "@/lib/server/leaderboard"
import { requirePermission } from "@/lib/server/session"
import { fmtNum } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { Segmented, SelectFilter } from "@/components/app/filters"
import { Podium } from "@/components/app/podium"

export const metadata: Metadata = { title: "Leaderboard" }

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ board?: string; dept?: string }> }) {
  await requirePermission("rewards:view")
  const sp = await searchParams
  const board = (["current", "quarter", "lifetime"].includes(sp.board ?? "") ? sp.board : "current") as Board
  const [rows, depts, deptList] = await Promise.all([
    leaderboard(board, { dept: sp.dept, take: 50 }),
    departmentBoard(),
    prisma.employee.findMany({ where: { department: { not: null } }, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } }),
  ])
  const maxDept = Math.max(1, ...depts.map((d) => d.points))
  const label = board === "quarter" ? "Event points, last 90 days" : board === "lifetime" ? "Lifetime points" : "Current points"

  return (
    <>
      <PageHeader title="Leaderboard" description="Who's showing up and learning the most. Use it to recognise people at town halls and in Mavericks Week." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented param="board" options={[{ value: "current", label: "Current points" }, { value: "quarter", label: "Last 90 days" }, { value: "lifetime", label: "Lifetime" }]} />
        <div className="ml-auto">
          <SelectFilter param="dept" label="Department" allLabel="All departments" options={deptList.map((d) => ({ value: d.department!, label: d.department! }))} />
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <Panel className="overflow-hidden">
          {rows.length >= 3 && (
            <div className="border-b bg-gradient-to-b from-accent/60 to-card pb-0">
              <Podium people={rows.slice(0, 3).map((r) => ({ id: r.id, name: r.name, sub: r.department ?? undefined, score: r.score, href: `/employees/${r.id}` }))} />
            </div>
          )}
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-14 pl-5 text-right">Rank</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Events</TableHead>
                  <TableHead className="pr-5 text-right">{label}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="num pl-5 text-right font-semibold text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <Link href={`/employees/${r.id}`} className="flex flex-col hover:text-primary">
                        <span className="font-medium">{r.name}</span>
                        <span className="num text-xs text-muted-foreground">{r.empId}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{r.department ?? "—"}</TableCell>
                    <TableCell className="num hidden text-right sm:table-cell">{r.events}</TableCell>
                    <TableCell className="num pr-5 text-right font-semibold">{fmtNum(r.score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="flex flex-col items-center gap-2 px-5 py-16 text-center text-sm text-muted-foreground"><TrophyIcon className="size-6" />No points recorded yet.</p>
          )}
        </Panel>
        <Panel className="h-fit">
          <PanelHeader title="By department" description="Current points of active employees" />
          <ul className="flex flex-col gap-3 p-5">
            {depts.map((d) => (
              <li key={d.department} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{d.department}</span>
                  <span className="num shrink-0 text-muted-foreground">{fmtNum(d.points)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(d.points / maxDept) * 100}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{fmtNum(d.people)} people</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
