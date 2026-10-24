import type { Metadata } from "next"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/server/session"
import { fmtDateTime } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel } from "@/components/app/page-header"
import { SearchFilter, SelectFilter } from "@/components/app/filters"
import { Pager } from "@/components/app/pager"

export const metadata: Metadata = { title: "Audit log" }
const PAGE = 50

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; page?: string }> }) {
  await requirePermission("audit:view")
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const where: Prisma.AuditLogWhereInput = {}
  if (sp.entity) where.entity = sp.entity
  if (sp.q) where.OR = [{ summary: { contains: sp.q, mode: "insensitive" } }, { action: { contains: sp.q, mode: "insensitive" } }, { actor: { name: { contains: sp.q, mode: "insensitive" } } }]
  const [rows, total, entities] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["entity"] }),
  ])
  return (
    <>
      <PageHeader title="Audit log" description="Every sign-in, change and decision, newest first. Entries can't be edited or deleted. Changes keep the before and after values." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SelectFilter param="entity" label="Record type" allLabel="All record types" options={entities.map((e) => ({ value: e.entity, label: e.entity }))} />
        <SearchFilter placeholder="Search person, action or summary" />
      </div>
      <Panel className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead className="hidden md:table-cell">Action</TableHead>
              <TableHead className="pr-5">What happened</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell className="pl-5 whitespace-nowrap text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{r.actor?.name ?? "System"}</TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{r.action}</TableCell>
                <TableCell className="pr-5">
                  <span className="whitespace-normal">{r.summary}</span>
                  {(r.before || r.after) && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-primary">Show changed values</summary>
                      <pre className="mt-2 max-h-72 max-w-[60vw] overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed whitespace-pre-wrap">{JSON.stringify({ before: r.before ?? undefined, after: r.after ?? undefined }, null, 2)}</pre>
                    </details>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager page={page} pageSize={PAGE} total={total} params={{ q: sp.q, entity: sp.entity }} path="/admin/audit" />
      </Panel>
    </>
  )
}
