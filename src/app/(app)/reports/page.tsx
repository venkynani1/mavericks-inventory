import type { Metadata } from "next"
import Link from "next/link"
import { FileDownIcon, SheetIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/server/session"
import { REPORTS, runReport, type Filters, type ReportKey } from "@/lib/server/reports"
import { getLookups } from "@/lib/server/lookups"
import { cn, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel } from "@/components/app/page-header"
import { DateFilter, SearchFilter, SelectFilter } from "@/components/app/filters"

export const metadata: Metadata = { title: "Reports" }
const SHOW = 100

export default async function Reports({ searchParams }: { searchParams: Promise<Filters & { r?: string }> }) {
  await requirePermission("report:view")
  const sp = await searchParams
  const key = (REPORTS.some((x) => x.key === sp.r) ? sp.r : "availability") as ReportKey
  const filters: Filters = { q: sp.q, from: sp.from, to: sp.to, category: sp.category, item: sp.item, purpose: sp.purpose, location: sp.location, stock: sp.stock }
  const [report, lookups, items] = await Promise.all([
    runReport(key, filters, SHOW),
    getLookups(),
    key === "ledger" || key === "distributed" ? prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ])
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString()
  const meta = REPORTS.find((r) => r.key === key)!

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every report reads straight from approved transactions, so the numbers match the ledger. Exports include all matching rows."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/reports/${key}?format=pdf${qs ? `&${qs}` : ""}`}>
                <FileDownIcon data-icon="inline-start" />
                PDF
              </a>
            </Button>
            <Button asChild>
              <a href={`/api/reports/${key}?format=xlsx${qs ? `&${qs}` : ""}`}>
                <SheetIcon data-icon="inline-start" />
                Excel
              </a>
            </Button>
          </>
        }
      />

      <nav aria-label="Reports" className="mb-5 flex gap-1 overflow-x-auto border-b">
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={`/reports?r=${r.key}`}
            aria-current={r.key === key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              r.key === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {r.title}
          </Link>
        ))}
      </nav>

      <p className="mb-4 text-sm text-muted-foreground">{meta.description}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {key === "availability" && (
          <>
            <SelectFilter param="category" label="Category" allLabel="All categories" options={lookups.categories} />
            <SelectFilter param="stock" label="Stock level" allLabel="Any stock level" options={[{ value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }]} />
            <SearchFilter placeholder="Item name or code…" />
          </>
        )}
        {key === "distributed" && (
          <>
            <DateFilter param="from" label="From" />
            <DateFilter param="to" label="To" />
            <SelectFilter param="purpose" label="Purpose" allLabel="All purposes" options={lookups.purposes.map((p) => ({ value: p, label: p }))} />
            <SelectFilter param="location" label="Location" allLabel="All locations" options={lookups.locations.map((p) => ({ value: p, label: p }))} />
            <SelectFilter param="item" label="Item" allLabel="All items" options={items.map((i) => ({ value: i.id, label: i.name }))} className="max-w-72" />
            <SearchFilter placeholder="Recipient name or Emp ID…" />
          </>
        )}
        {key === "approvals" && (
          <>
            <DateFilter param="from" label="From" />
            <DateFilter param="to" label="To" />
            <SearchFilter placeholder="Request number or title…" />
          </>
        )}
        {key === "ledger" && (
          <>
            <DateFilter param="from" label="From" />
            <DateFilter param="to" label="To" />
            <SelectFilter param="item" label="Item" allLabel="All items" options={items.map((i) => ({ value: i.id, label: i.name }))} className="max-w-72" />
          </>
        )}
      </div>

      {report.summary && (
        <div className="mb-4 flex flex-wrap gap-x-10 gap-y-3 rounded-xl border bg-card px-5 py-4">
          {report.summary.map((s) => (
            <div key={s.label} className="flex flex-col">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span className="num text-xl font-semibold">{fmtNum(Number(s.value))}</span>
            </div>
          ))}
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {report.columns.map((c, i) => (
                  <TableHead key={c.key} className={cn(c.align === "right" && "text-right", i === 0 && "pl-5", i === report.columns.length - 1 && "pr-5")}>
                    {c.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row, ri) => (
                <TableRow key={ri}>
                  {report.columns.map((c, i) => (
                    <TableCell
                      key={c.key}
                      className={cn(c.numeric && "num", c.align === "right" && "text-right", i === 0 && "pl-5", i === report.columns.length - 1 && "pr-5", c.key === "name" || c.key === "item" || c.key === "title" || c.key === "remarks" ? "max-w-80 truncate" : "whitespace-nowrap")}
                    >
                      {row[c.key] ?? "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!report.rows.length && (
                <TableRow>
                  <TableCell colSpan={report.columns.length} className="py-10 text-center text-muted-foreground">Nothing matches these filters.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="border-t px-5 py-3 text-sm text-muted-foreground">
          {report.total > report.rows.length ? `Showing the first ${fmtNum(report.rows.length)} of ${fmtNum(report.total)} rows. Export to get all of them.` : `${fmtNum(report.total)} rows`}
        </p>
      </Panel>
    </>
  )
}
