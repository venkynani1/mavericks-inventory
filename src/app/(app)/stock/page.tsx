import type { Metadata } from "next"
import Link from "next/link"
import { Prisma } from "@prisma/client"
import { DownloadIcon, PackageSearchIcon, PlusIcon, UploadIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/server/session"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader, Panel } from "@/components/app/page-header"
import { SearchFilter, Segmented, SelectFilter } from "@/components/app/filters"
import { StockGauge } from "@/components/app/stock-gauge"
import { ItemStateBadge } from "@/components/app/status-badge"
import { Pager } from "@/components/app/pager"

export const metadata: Metadata = { title: "Stock" }
const PAGE = 50

type SP = { q?: string; category?: string; state?: string; page?: string }

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const categories = await prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  const cat = categories.find((c) => c.id === sp.category || c.name === sp.category)

  const base: Prisma.StockItemWhereInput = {}
  if (cat) base.categoryId = cat.id
  if (sp.q) base.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { code: { contains: sp.q, mode: "insensitive" } }, { brand: { contains: sp.q, mode: "insensitive" } }]

  const state = sp.state ?? "active"
  const where: Prisma.StockItemWhereInput = { ...base }
  if (state === "draft") where.status = "DRAFT"
  else {
    where.status = "ACTIVE"
    // Prisma can't compare two columns, so low/out filters use raw ids below.
  }
  let idFilter: string[] | undefined
  if (state === "low" || state === "out") {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "StockItem" WHERE status = 'ACTIVE' AND ${state === "out" ? Prisma.sql`"availableQty" <= 0` : Prisma.sql`"availableQty" > 0 AND "availableQty" <= "reorderLevel"`}`
    idFilter = rows.map((r) => r.id)
  }
  if (idFilter) where.id = { in: idFilter }

  const [items, total, counts] = await Promise.all([
    prisma.stockItem.findMany({ where, include: { category: true, request: { select: { number: true, status: true, id: true } } }, orderBy: [{ name: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
    prisma.stockItem.count({ where }),
    prisma.$queryRaw<{ active: bigint; low: bigint; out: bigint; draft: bigint }[]>`
      SELECT count(*) FILTER (WHERE status='ACTIVE') AS active,
             count(*) FILTER (WHERE status='ACTIVE' AND "availableQty" > 0 AND "availableQty" <= "reorderLevel") AS low,
             count(*) FILTER (WHERE status='ACTIVE' AND "availableQty" <= 0) AS out,
             count(*) FILTER (WHERE status='DRAFT') AS draft
      FROM "StockItem"`,
  ])
  const c = counts[0]
  const exec = user.role === "EXECUTIVE"

  return (
    <>
      <PageHeader
        title="Stock"
        description="Every goodie, kit and device Mavericks hands out. Quantities change only when a request is approved."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/reports/availability?format=xlsx${cat ? `&category=${cat.id}` : ""}`}>
                <DownloadIcon data-icon="inline-start" />
                Export
              </a>
            </Button>
            {exec && (
              <>
                <Button variant="outline" asChild>
                  <Link href="/stock/upload">
                    <UploadIcon data-icon="inline-start" />
                    Upload Excel
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/stock/new">
                    <PlusIcon data-icon="inline-start" />
                    Add item
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          param="state"
          options={[
            { value: "active", label: "All active", count: Number(c.active) },
            { value: "low", label: "Low", count: Number(c.low) },
            { value: "out", label: "Out", count: Number(c.out) },
            { value: "draft", label: "Awaiting approval", count: Number(c.draft) },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SelectFilter param="category" label="Category" allLabel="All categories" options={categories.map((x) => ({ value: x.id, label: x.name }))} />
          <SearchFilter placeholder="Search name, code or brand…" />
        </div>
      </div>

      <Panel className="overflow-hidden">
        {items.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Item</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Variant</TableHead>
                <TableHead className="w-24 sm:w-64">On the shelf</TableHead>
                <TableHead className="hidden pr-5 sm:table-cell">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id} className="group">
                  <TableCell className="max-w-0 pl-5 sm:max-w-none">
                    <Link href={`/stock/${i.id}`} className="flex flex-col rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <span className="truncate font-medium group-hover:text-primary">{i.name}</span>
                      <span className="num text-xs text-muted-foreground">{i.code}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{i.category.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{[i.size, i.color, i.brand].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell>
                    {i.status === "DRAFT" ? (
                      <span className="num text-sm text-muted-foreground">{i.openingQty} opening, pending</span>
                    ) : (
                      <StockGauge available={i.availableQty} total={i.openingQty + i.receivedQty} reorder={i.reorderLevel} className="max-sm:min-w-0 max-sm:[&>div:first-child]:hidden" />
                    )}
                  </TableCell>
                  <TableCell className="hidden pr-5 sm:table-cell">
                    <ItemStateBadge available={i.availableQty} reorder={i.reorderLevel} status={i.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearchIcon />
              </EmptyMedia>
              <EmptyTitle>No items match</EmptyTitle>
              <EmptyDescription>{sp.q || cat ? "Clear the search or pick another category." : exec ? "Add an item or upload your stock sheet to get started." : "Executives add stock items; they appear here after approval."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <Pager page={page} pageSize={PAGE} total={total} params={{ q: sp.q, category: sp.category, state: sp.state }} path="/stock" />
      </Panel>
    </>
  )
}
