import type { Metadata } from "next"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { ArrowDownLeftIcon, ArrowUpRightIcon, DownloadIcon, RefreshCwIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/server/session"
import { cn, fmtDateTime, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel } from "@/components/app/page-header"
import { DateFilter, SearchFilter, Segmented } from "@/components/app/filters"
import { Pager } from "@/components/app/pager"

export const metadata: Metadata = { title: "Stock movements" }
const PAGE = 50
type SP = { q?: string; type?: string; from?: string; to?: string; page?: string }
const LABEL = { OPENING: "Opening", RECEIPT: "Inward", DISTRIBUTION: "Distribution", ADJUSTMENT: "Count adjustment" } as const

export default async function Movements({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("inventory:view")
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const where: Prisma.LedgerEntryWhereInput = {}
  if (sp.type && sp.type in LABEL) where.type = sp.type as keyof typeof LABEL
  if (sp.q) where.stockItem = { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { code: { contains: sp.q, mode: "insensitive" } }] }
  if (sp.from || sp.to) where.createdAt = { ...(sp.from ? { gte: new Date(`${sp.from}T00:00:00+05:30`) } : {}), ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59+05:30`) } : {}) }
  const [rows, total, sums] = await Promise.all([
    prisma.ledgerEntry.findMany({ where, include: { stockItem: { select: { id: true, code: true, name: true } }, request: { select: { id: true, number: true, title: true } }, actor: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.aggregate({ where, _sum: { qtyIn: true, qtyOut: true } }),
  ])
  const exportHref = `/api/reports/ledger?format=xlsx${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`
  return (
    <>
      <PageHeader
        title="Stock movements"
        description="The ledger: every unit in and out, with who approved it and the balance after. Entries are never edited or deleted."
        actions={<Button variant="outline" asChild><a href={exportHref}><DownloadIcon data-icon="inline-start" />Export</a></Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented param="type" options={[{ value: "all", label: "All" }, { value: "RECEIPT", label: "Inward" }, { value: "DISTRIBUTION", label: "Distribution" }, { value: "ADJUSTMENT", label: "Adjustments" }, { value: "OPENING", label: "Opening" }]} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DateFilter param="from" label="From" />
          <DateFilter param="to" label="To" />
          <SearchFilter placeholder="Item name or code…" />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>In <span className="num font-semibold text-approved">+{fmtNum(sums._sum.qtyIn ?? 0)}</span></span>
        <span>Out <span className="num font-semibold text-rejected">-{fmtNum(sums._sum.qtyOut ?? 0)}</span></span>
        <span>{fmtNum(total)} movements</span>
      </div>
      <Panel className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">When</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="hidden md:table-cell">Movement</TableHead>
              <TableHead className="hidden lg:table-cell">Request</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>
              <TableHead className="hidden pr-5 xl:table-cell">Approved by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const qty = r.qtyIn - r.qtyOut
              const Icon = r.type === "ADJUSTMENT" ? RefreshCwIcon : qty >= 0 ? ArrowDownLeftIcon : ArrowUpRightIcon
              return (
                <TableRow key={r.id}>
                  <TableCell className="num pl-5 whitespace-nowrap text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell>
                  <TableCell className="max-w-0 w-full sm:max-w-none sm:w-auto">
                    <Link href={`/stock/${r.stockItem.id}`} className="flex flex-col hover:text-primary">
                      <span className="truncate font-medium">{r.stockItem.name}</span>
                      <span className="num text-xs text-muted-foreground">{r.stockItem.code}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-sm"><Icon className={cn("size-4", qty >= 0 ? "text-approved" : "text-rejected")} />{LABEL[r.type]}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{r.request ? <Link href={`/requests/${r.request.id}`} className="num text-sm hover:text-primary">{r.request.number}</Link> : "—"}</TableCell>
                  <TableCell className={cn("num text-right font-semibold", qty >= 0 ? "text-approved" : "text-rejected")}>{qty > 0 ? "+" : ""}{fmtNum(qty)}</TableCell>
                  <TableCell className="num hidden text-right sm:table-cell">{fmtNum(r.balanceAfter)}</TableCell>
                  <TableCell className="hidden pr-5 text-muted-foreground xl:table-cell">{r.actor.name}</TableCell>
                </TableRow>
              )
            })}
            {!rows.length && <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No movements match these filters.</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Pager page={page} pageSize={PAGE} total={total} params={{ q: sp.q, type: sp.type, from: sp.from, to: sp.to }} path="/movements" />
      </Panel>
    </>
  )
}
