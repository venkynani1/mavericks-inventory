import Link from "next/link"
import type { Prisma, RequestType } from "@prisma/client"
import { FileClockIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import type { SessionUser } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { isOverdue } from "@/lib/server/workflow"
import { count as plural, fmtDate, fmtNum } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Panel } from "./page-header"
import { SearchFilter, Segmented } from "./filters"
import { StatusBadge, typeLabel, type ReqStatus } from "./status-badge"
import { Pager } from "./pager"

const PAGE = 30
export type ListParams = { status?: string; scope?: string; q?: string; page?: string }

export async function RequestsList({ user, type, sp, path, emptyHint }: { user: SessionUser; type?: RequestType; sp: ListParams; path: string; emptyHint: string }) {
  const page = Math.max(1, Number(sp.page) || 1)
  const scope = sp.scope ?? (user.role === "EXECUTIVE" ? "mine" : "all")
  const base: Prisma.RequestWhereInput = { status: { not: "CANCELLED" } }
  if (type) base.type = type
  if (scope === "mine") base.createdById = user.id
  if (sp.q) base.OR = [{ number: { contains: sp.q, mode: "insensitive" } }, { title: { contains: sp.q, mode: "insensitive" } }, { purpose: { contains: sp.q, mode: "insensitive" } }]

  const where: Prisma.RequestWhereInput = { ...base }
  if (sp.status === "open") where.status = { in: ["DRAFT", "REJECTED"] }
  else if (sp.status) where.status = sp.status as ReqStatus

  const [rows, total, grouped, settings] = await Promise.all([
    prisma.request.findMany({ where, include: { createdBy: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
    prisma.request.count({ where }),
    prisma.request.groupBy({ by: ["status"], where: base, _count: true }),
    getSettings(),
  ])
  const count = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0
  const all = grouped.reduce((a, g) => a + g._count, 0)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          param="status"
          options={[
            { value: "", label: "All", count: all },
            { value: "DRAFT", label: "Drafts", count: count("DRAFT") },
            { value: "SUBMITTED", label: "In review", count: count("SUBMITTED") },
            { value: "APPROVED", label: "Approved", count: count("APPROVED") },
            { value: "REJECTED", label: "Returned", count: count("REJECTED") },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented param="scope" options={user.role === "EXECUTIVE" ? [{ value: "mine", label: "Mine" }, { value: "all", label: "Everyone's" }] : [{ value: "all", label: "Everyone's" }, { value: "mine", label: "Mine" }]} />
          <SearchFilter placeholder="Search number, title or purpose…" />
        </div>
      </div>
      <Panel className="overflow-hidden">
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Request</TableHead>
                {!type && <TableHead className="hidden md:table-cell">Type</TableHead>}
                <TableHead className="hidden lg:table-cell">Created by</TableHead>
                <TableHead className="hidden sm:table-cell">Last activity</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="pr-5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const late = r.status === "SUBMITTED" && isOverdue(r.submittedAt, settings.escalationHours)
                return (
                  <TableRow key={r.id} className="group">
                    <TableCell className="max-w-0 pl-5 sm:max-w-none">
                      <Link href={`/requests/${r.id}`} className="flex flex-col rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                        <span className="truncate font-medium group-hover:text-primary">{r.title}</span>
                        <span className="num text-xs text-muted-foreground">
                          {r.number}
                          {r.purpose ? `, ${r.purpose}` : ""}
                        </span>
                      </Link>
                    </TableCell>
                    {!type && <TableCell className="hidden text-muted-foreground md:table-cell">{typeLabel(r.type)}</TableCell>}
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{r.createdBy.name}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{fmtDate(r.decidedAt ?? r.submittedAt ?? r.createdAt)}</TableCell>
                    <TableCell className="num text-right">
                      {fmtNum(r.totalQty)}
                      <span className="block text-xs text-muted-foreground">{plural(r.lineCount, "line")}</span>
                    </TableCell>
                    <TableCell className="pr-5">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={r.status as ReqStatus} level={r.currentLevel} required={r.requiredLevel} />
                        {late && <span className="text-xs text-pending">Waiting over {settings.escalationHours}h</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileClockIcon />
              </EmptyMedia>
              <EmptyTitle>No requests here</EmptyTitle>
              <EmptyDescription>{sp.q || sp.status ? "Try another status or clear the search." : emptyHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <Pager page={page} pageSize={PAGE} total={total} params={{ status: sp.status, scope: sp.scope, q: sp.q }} path={path} />
      </Panel>
    </>
  )
}
