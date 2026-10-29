import type { Metadata } from "next"
import Link from "next/link"
import { Prisma } from "@prisma/client"
import { ClipboardListIcon, PlusIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { requirePermission } from "@/lib/server/session"
import { fmtDate, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader, Panel } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"

export const metadata: Metadata = { title: "Stock counts" }

export default async function Counts() {
  const user = await requirePermission("inventory:view")
  const counts = await prisma.request.findMany({ where: { type: "STOCK_COUNT", status: { not: "CANCELLED" } }, include: { createdBy: true }, orderBy: { createdAt: "desc" }, take: 100 })
  const nets = counts.length
    ? await prisma.$queryRaw<{ requestId: string; net: number }[]>`SELECT "requestId", sum("countedQty" - "systemQty")::int AS net FROM "StockCountLine" WHERE "requestId" IN (${Prisma.join(counts.map((c) => c.id))}) GROUP BY 1`
    : []
  const netBy = new Map(nets.map((n) => [n.requestId, n.net]))
  return (
    <>
      <PageHeader
        title="Stock counts"
        description="Periodic physical counts (cycle counts). Differences go through the same approval as any other stock change, so the ledger always explains the balance."
        actions={can(user.role, "request:create") && <Button asChild><Link href="/counts/new"><PlusIcon data-icon="inline-start" />New count</Link></Button>}
      />
      <Panel className="overflow-hidden">
        {counts.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Count</TableHead>
                <TableHead className="hidden md:table-cell">Counted by</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-right">Items differing</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Net change</TableHead>
                <TableHead className="pr-5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {counts.map((c) => {
                const net = netBy.get(c.id)
                return (
                  <TableRow key={c.id} className="group">
                    <TableCell className="pl-5">
                      <Link href={`/requests/${c.id}`} className="flex flex-col">
                        <span className="font-medium group-hover:text-primary">{c.title}</span>
                        <span className="num text-xs text-muted-foreground">{c.number}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{c.createdBy.name}</TableCell>
                    <TableCell className="num hidden sm:table-cell">{fmtDate(c.createdAt)}</TableCell>
                    <TableCell className="num text-right">{c.lineCount}</TableCell>
                    <TableCell className="num hidden text-right sm:table-cell">{net === undefined ? "—" : `${net > 0 ? "+" : ""}${fmtNum(net)}`}</TableCell>
                    <TableCell className="pr-5"><StatusBadge status={c.status} level={c.currentLevel} required={c.requiredLevel} /></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardListIcon /></EmptyMedia>
              <EmptyTitle>No counts yet</EmptyTitle>
              <EmptyDescription>Count a shelf or a category every few weeks. Small, frequent counts catch mistakes early.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </Panel>
    </>
  )
}
