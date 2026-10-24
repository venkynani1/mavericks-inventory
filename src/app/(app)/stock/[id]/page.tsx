import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowDownToLineIcon, DownloadIcon, PackageOpenIcon, PencilIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/server/session"
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader, Panel } from "@/components/app/page-header"
import { StockGauge } from "@/components/app/stock-gauge"
import { ItemStateBadge } from "@/components/app/status-badge"
import { DeleteItemButton } from "@/components/app/delete-item-button"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const i = await prisma.stockItem.findUnique({ where: { id }, select: { name: true } })
  return { title: i?.name ?? "Stock item" }
}

const MOVE: Record<string, string> = { OPENING: "Opening", RECEIPT: "Stock inward", DISTRIBUTION: "Distribution", ADJUSTMENT: "Adjustment" }

export default async function StockItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const item = await prisma.stockItem.findUnique({
    where: { id },
    include: { category: true, createdBy: true, request: true, _count: { select: { distributionLines: true, receiptLines: true } } },
  })
  if (!item) notFound()
  const [ledger, recipients, pendingOut] = await Promise.all([
    prisma.ledgerEntry.findMany({ where: { stockItemId: id }, include: { request: true, actor: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200 }),
    prisma.distributionLine.findMany({ where: { stockItemId: id, request: { status: "APPROVED" } }, include: { request: true }, orderBy: { distributedOn: "desc" }, take: 200 }),
    prisma.distributionLine.aggregate({ where: { stockItemId: id, request: { status: "SUBMITTED" } }, _sum: { quantity: true } }),
  ])
  const total = item.openingQty + item.receivedQty
  const inReview = pendingOut._sum.quantity ?? 0
  const isDraft = item.status === "DRAFT"
  const ownDraft = isDraft && item.createdById === user.id && ["DRAFT", "REJECTED"].includes(item.request?.status ?? "")
  const canEdit = ownDraft || (user.role === "ADMIN" && item.status === "ACTIVE")
  const canDelete = ownDraft || (user.role === "ADMIN" && item.status === "ACTIVE" && item._count.distributionLines + item._count.receiptLines === 0 && item.availableQty === 0)

  const attrs: [string, React.ReactNode][] = [
    ["Stock code", <span key="c" className="num">{item.code}</span>],
    ["Product", item.product],
    ["Category", item.category.name],
    ["Size", item.size ?? "—"],
    ["Colour", item.color ?? "—"],
    ["Brand", item.brand ?? "—"],
    ["Unit", item.unit],
    ["Location", item.location ?? "—"],
    ["Unit cost", item.unitCost ? `₹${Number(item.unitCost).toLocaleString("en-IN")}` : "—"],
    ["Reorder level", item.reorderLevel],
    ["Added by", `${item.createdBy.name}, ${fmtDate(item.createdAt)}`],
    ["Source request", item.request ? <Link key="r" className="text-primary hover:underline" href={`/requests/${item.request.id}`}>{item.request.number}</Link> : "—"],
  ]

  return (
    <>
      <PageHeader
        title={item.name}
        description={<span className="num">{item.code}</span>}
        actions={
          <>
            {item.status === "ACTIVE" && user.role === "EXECUTIVE" && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/receipts/new?item=${item.id}`}>
                    <ArrowDownToLineIcon data-icon="inline-start" />
                    Stock inward
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/distributions/new?item=${item.id}`}>
                    <PackageOpenIcon data-icon="inline-start" />
                    Distribute
                  </Link>
                </Button>
              </>
            )}
            {canEdit && (
              <Button variant="outline" asChild>
                <Link href={`/stock/${item.id}/edit`}>
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Link>
              </Button>
            )}
            {canDelete && <DeleteItemButton id={item.id} name={item.name} draft={isDraft} />}
          </>
        }
      >
        <div className="mt-1">
          <ItemStateBadge available={item.availableQty} reorder={item.reorderLevel} status={item.status} />
        </div>
      </PageHeader>

      {isDraft && (
        <Alert className="mb-6">
          <AlertTitle>This item isn&apos;t in stock yet</AlertTitle>
          <AlertDescription>
            It&apos;s part of {item.request?.number}. The opening quantity of {item.openingQty} is added once that request gets final approval.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel className="p-5">
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              <Figure label="Stocked so far" value={fmtNum(total)} hint={`${fmtNum(item.openingQty)} opening + ${fmtNum(item.receivedQty)} inward`} />
              <Figure label="Handed out" value={fmtNum(item.distributedQty)} hint={`${recipients.length >= 200 ? "200+" : recipients.length} approved lines`} />
              <Figure label="In review" value={fmtNum(inReview)} hint="Not yet deducted" />
              <Figure label="Available" value={fmtNum(item.availableQty)} hint={inReview ? `${fmtNum(Math.max(0, item.availableQty - inReview))} after pending requests` : "Ready to distribute"} strong />
            </div>
            <StockGauge className="mt-5" available={item.availableQty} total={total} reorder={item.reorderLevel} showLabel={false} />
            <p className="mt-2 text-xs text-muted-foreground">The bar is everything ever stocked; the solid part is what&apos;s still on the shelf. The tick marks the reorder level.</p>
          </Panel>

          <Tabs defaultValue="ledger">
            <TabsList>
              <TabsTrigger value="ledger">Movement ledger</TabsTrigger>
              <TabsTrigger value="recipients">Recipients</TabsTrigger>
            </TabsList>
            <TabsContent value="ledger">
              <Panel className="overflow-hidden">
                <div className="flex items-center justify-between border-b px-5 py-3">
                  <span className="text-sm text-muted-foreground">Newest first. Entries are written only when a request is approved.</span>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/api/reports/ledger?format=xlsx&item=${item.id}`}>
                      <DownloadIcon data-icon="inline-start" />
                      Excel
                    </a>
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Posted</TableHead>
                      <TableHead>Movement</TableHead>
                      <TableHead>Request</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="pr-5 text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="pl-5 whitespace-nowrap text-muted-foreground">{fmtDateTime(l.createdAt)}</TableCell>
                        <TableCell>{MOVE[l.type]}</TableCell>
                        <TableCell>{l.request ? <Link href={`/requests/${l.request.id}`} className="num text-primary hover:underline">{l.request.number}</Link> : "—"}</TableCell>
                        <TableCell className="num text-right text-approved">{l.qtyIn ? `+${fmtNum(l.qtyIn)}` : ""}</TableCell>
                        <TableCell className="num text-right">{l.qtyOut ? `−${fmtNum(l.qtyOut)}` : ""}</TableCell>
                        <TableCell className="num pr-5 text-right font-medium">{fmtNum(l.balanceAfter)}</TableCell>
                      </TableRow>
                    ))}
                    {!ledger.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No movements yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Panel>
            </TabsContent>
            <TabsContent value="recipients">
              <Panel className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Date</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead className="hidden md:table-cell">Purpose</TableHead>
                      <TableHead className="hidden md:table-cell">Location</TableHead>
                      <TableHead className="pr-5 text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="pl-5 whitespace-nowrap text-muted-foreground">{fmtDate(r.distributedOn)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{r.recipientName}</span>
                            <span className="num text-xs text-muted-foreground">{r.recipientId ?? "No employee ID"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{r.purpose ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{r.location ?? "—"}</TableCell>
                        <TableCell className="num pr-5 text-right">{r.quantity}</TableCell>
                      </TableRow>
                    ))}
                    {!recipients.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nobody has received this item yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Panel>
            </TabsContent>
          </Tabs>
        </div>

        <Panel className="h-fit">
          <h2 className="border-b px-5 py-4 text-[15px] font-semibold">Details</h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 px-5 py-4 text-sm">
            {attrs.map(([k, val]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate text-right">{val}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  )
}

function Figure({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`num text-2xl font-semibold ${strong ? "text-primary" : ""}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  )
}
