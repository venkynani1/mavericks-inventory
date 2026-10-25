import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DownloadIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { rolesForLevel } from "@/lib/roles"
import { requireUser } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { availabilityShortfalls, isOverdue } from "@/lib/server/workflow"
import { pickableItems } from "@/lib/server/pick-items"
import { cn, count, fmtDate, fmtDateTime, fmtNum } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { StatusBadge, typeLabel, type ReqStatus } from "@/components/app/status-badge"
import { ApproverActions, MakerActions } from "@/components/app/request-actions"
import { DistLineDialog, ReceiptLineDialog, RemoveLineButton } from "@/components/app/line-editor"
import { Pager } from "@/components/app/pager"

const LINES_PER_PAGE = 100

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const r = await prisma.request.findUnique({ where: { id }, select: { number: true } })
  return { title: r?.number ?? "Request" }
}

const ACTION: Record<string, { label: string; dot: string }> = {
  SUBMITTED: { label: "Submitted", dot: "bg-pending" },
  RESUBMITTED: { label: "Resubmitted", dot: "bg-pending" },
  APPROVED: { label: "Approved", dot: "bg-approved" },
  REJECTED: { label: "Returned", dot: "bg-rejected" },
  CANCELLED: { label: "Draft deleted", dot: "bg-muted-foreground" },
}

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const page = Math.max(1, Number((await searchParams).page) || 1)
  const req = await prisma.request.findUnique({
    where: { id },
    include: { createdBy: true, events: { include: { actor: true }, orderBy: { createdAt: "asc" } } },
  })
  if (!req) notFound()
  const settings = await getSettings()

  const editable = req.createdById === user.id && (req.status === "DRAFT" || req.status === "REJECTED") && user.role === "EXECUTIVE"
  const level = req.currentLevel + 1
  const canDecide = req.status === "SUBMITTED" && req.createdById !== user.id && rolesForLevel(level).includes(user.role)
  const roundStart = req.submittedAt
  const alreadyApproved = req.events.some((e) => e.action === "APPROVED" && e.actorId === user.id && roundStart && e.createdAt >= roundStart)
  const lastReject = [...req.events].reverse().find((e) => e.action === "REJECTED")
  const skip = (page - 1) * LINES_PER_PAGE

  // ----- lines by type
  type Summary = { id: string; code: string; name: string; qty: number; available: number; status: string }
  let summary: Summary[] = []
  let table: React.ReactNode = null
  const items = editable && req.type !== "STOCK_MASTER" ? await pickableItems() : []

  if (req.type === "DISTRIBUTION") {
    const [lines, grouped] = await Promise.all([
      prisma.distributionLine.findMany({ where: { requestId: id }, include: { stockItem: true }, orderBy: { createdAt: "asc" }, skip, take: LINES_PER_PAGE }),
      prisma.distributionLine.groupBy({ by: ["stockItemId"], where: { requestId: id }, _sum: { quantity: true } }),
    ])
    const its = await prisma.stockItem.findMany({ where: { id: { in: grouped.map((g) => g.stockItemId) } } })
    summary = grouped.map((g) => {
      const it = its.find((i) => i.id === g.stockItemId)!
      return { id: it.id, code: it.code, name: it.name, qty: g._sum.quantity ?? 0, available: it.availableQty, status: it.status }
    }).sort((a, b) => b.qty - a.qty)
    const first = lines[0]
    table = (
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Item</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead className="hidden md:table-cell">Date</TableHead>
            <TableHead className="hidden xl:table-cell">Location</TableHead>
            <TableHead className="hidden lg:table-cell">Purpose</TableHead>
            <TableHead className="hidden 2xl:table-cell">POC</TableHead>
            {editable && <TableHead className="w-20 pr-5"><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="max-w-64 pl-5">
                <Link href={`/stock/${l.stockItemId}`} className="block truncate hover:text-primary">{l.stockItem.name}</Link>
                <span className="num text-xs text-muted-foreground">{l.stockItem.code}</span>
              </TableCell>
              <TableCell className="num text-right">{l.quantity}</TableCell>
              <TableCell>
                <span className="block">{l.recipientName}</span>
                <span className="num text-xs text-muted-foreground">{l.recipientId ?? "—"}</span>
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{fmtDate(l.distributedOn)}</TableCell>
              <TableCell className="hidden text-muted-foreground xl:table-cell">{l.location ?? "—"}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{l.purpose ?? "—"}</TableCell>
              <TableCell className="hidden text-muted-foreground 2xl:table-cell">{l.poc ?? "—"}</TableCell>
              {editable && (
                <TableCell className="pr-5">
                  <div className="flex justify-end">
                    <DistLineDialog
                      requestId={id}
                      lineId={l.id}
                      items={items}
                      initial={{
                        stockItemId: l.stockItemId, quantity: String(l.quantity), distributedOn: new Date(l.distributedOn.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10),
                        recipientId: l.recipientId ?? "", recipientName: l.recipientName, location: l.location ?? "", purpose: l.purpose ?? "", poc: l.poc ?? "", remarks: l.remarks ?? "",
                      }}
                    />
                    <RemoveLineButton requestId={id} lineId={l.id} label={`${l.stockItem.name} for ${l.recipientName}`} />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
    if (editable)
      table = (
        <>
          <div className="flex justify-end border-b px-5 py-2.5">
            <DistLineDialog requestId={id} items={items} defaults={first ? { location: first.location ?? "", purpose: first.purpose ?? "", poc: first.poc ?? "" } : { purpose: req.purpose ?? "" }} />
          </div>
          {table}
        </>
      )
  } else if (req.type === "RECEIPT") {
    const lines = await prisma.receiptLine.findMany({ where: { requestId: id }, include: { stockItem: true }, orderBy: { createdAt: "asc" }, skip, take: LINES_PER_PAGE })
    table = (
      <>
        {editable && (
          <div className="flex justify-end border-b px-5 py-2.5">
            <ReceiptLineDialog requestId={id} items={items} />
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Item</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">On shelf now</TableHead>
              <TableHead className="hidden md:table-cell">Received on</TableHead>
              <TableHead className="hidden md:table-cell">Remarks</TableHead>
              {editable && <TableHead className="w-20 pr-5"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="max-w-72 pl-5">
                  <Link href={`/stock/${l.stockItemId}`} className="block truncate hover:text-primary">{l.stockItem.name}</Link>
                  <span className="num text-xs text-muted-foreground">{l.stockItem.code}</span>
                </TableCell>
                <TableCell className="num text-right text-approved">+{fmtNum(l.quantity)}</TableCell>
                <TableCell className="num text-right">{fmtNum(l.stockItem.availableQty)}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{fmtDate(l.receivedOn)}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{l.remarks ?? "—"}</TableCell>
                {editable && (
                  <TableCell className="pr-5">
                    <div className="flex justify-end">
                      <ReceiptLineDialog requestId={id} lineId={l.id} items={items} initial={{ stockItemId: l.stockItemId, quantity: String(l.quantity), receivedOn: new Date(l.receivedOn.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10), remarks: l.remarks ?? "" }} />
                      <RemoveLineButton requestId={id} lineId={l.id} label={l.stockItem.name} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    )
  } else {
    const masterItems = await prisma.stockItem.findMany({ where: { requestId: id, status: { not: "INACTIVE" } }, include: { category: true }, orderBy: { code: "asc" }, skip, take: LINES_PER_PAGE })
    table = (
      <>
        {editable && (
          <div className="flex justify-end border-b px-5 py-2.5">
            <Button variant="outline" size="sm" asChild>
              <Link href="/stock/new">Add item</Link>
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Item</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Variant</TableHead>
              <TableHead className="text-right">Opening qty</TableHead>
              {editable && <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {masterItems.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="pl-5">
                  <Link href={`/stock/${i.id}`} className="block hover:text-primary">{i.name}</Link>
                  <span className="num text-xs text-muted-foreground">{i.code}</span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{i.category.name}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{[i.size, i.color, i.brand].filter(Boolean).join(", ") || "—"}</TableCell>
                <TableCell className="num text-right">{fmtNum(i.openingQty)}</TableCell>
                {editable && (
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/stock/${i.id}/edit`}>Edit</Link>
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    )
  }

  const shortfalls = req.type === "DISTRIBUTION" && ["DRAFT", "REJECTED", "SUBMITTED"].includes(req.status) ? await prisma.$transaction((tx) => availabilityShortfalls(tx, id)) : []
  const overdue = req.status === "SUBMITTED" && isOverdue(req.submittedAt, settings.escalationHours)
  const finalLevel = level >= req.requiredLevel

  return (
    <>
      <PageHeader
        title={req.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="num rounded bg-muted px-1.5 py-0.5 text-foreground">{req.number}</span>
            <span>
              {typeLabel(req.type)}
              {req.purpose ? ` for ${req.purpose}` : ""}
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="ghost" asChild>
              <a href={`/api/requests/${id}/export`}>
                <DownloadIcon data-icon="inline-start" />
                Excel
              </a>
            </Button>
            {editable && <MakerActions id={id} status={req.status} title={req.title} purpose={req.purpose} remarks={req.remarks} isMaster={req.type === "STOCK_MASTER"} lineCount={req.lineCount} />}
            {canDecide && !alreadyApproved && <ApproverActions id={id} finalLevel={finalLevel} level={level} required={req.requiredLevel} />}
          </>
        }
      >
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={req.status as ReqStatus} level={req.currentLevel} required={req.requiredLevel} />
          {overdue && <span className="text-xs text-pending">Waiting more than {settings.escalationHours} hours</span>}
        </div>
      </PageHeader>

      {req.status === "REJECTED" && lastReject && (
        <Alert variant="destructive" className="mb-6 border-rejected/30 bg-rejected-soft">
          <TriangleAlertIcon />
          <AlertTitle>Returned by {lastReject.actor.name} on {fmtDate(lastReject.createdAt)}</AlertTitle>
          <AlertDescription>
            <p>“{lastReject.remarks}”</p>
            {editable && <p className="mt-1">Fix the lines below, then resubmit.</p>}
          </AlertDescription>
        </Alert>
      )}
      {shortfalls.length > 0 && (
        <Alert className="mb-6 border-pending/30 bg-pending-soft text-pending">
          <TriangleAlertIcon />
          <AlertTitle>Not enough stock for {shortfalls.length} item{shortfalls.length > 1 ? "s" : ""}</AlertTitle>
          <AlertDescription className="text-pending/90">
            <ul className="list-disc pl-4">
              {shortfalls.slice(0, 5).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {settings.preventNegativeStock && <p className="mt-1">This request can&apos;t be {req.status === "SUBMITTED" ? "approved" : "submitted"} until the quantities fit.</p>}
          </AlertDescription>
        </Alert>
      )}
      {req.status === "SUBMITTED" && req.createdById === user.id && (
        <Alert className="mb-6">
          <InfoIcon />
          <AlertTitle>Waiting for {level === 1 ? "a Manager" : "a Management Authority"}</AlertTitle>
          <AlertDescription>You&apos;ll be able to edit it again only if an approver returns it.</AlertDescription>
        </Alert>
      )}
      {canDecide && alreadyApproved && (
        <Alert className="mb-6">
          <InfoIcon />
          <AlertTitle>You approved the previous level</AlertTitle>
          <AlertDescription>A different approver has to sign off level {level}.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {summary.length > 0 && (
            <Panel>
              <PanelHeader title="Stock impact" description={req.status === "APPROVED" ? "Deducted when this request was approved" : "What approval would take off the shelf, against what's available now"} />
              <ul className="divide-y">
                {summary.map((s) => {
                  const after = s.available - s.qty
                  const pending = req.status !== "APPROVED"
                  return (
                    <li key={s.id} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {s.name} <span className="num text-xs text-muted-foreground">{s.code}</span>
                      </span>
                      <span className="num w-16 text-right">−{fmtNum(s.qty)}</span>
                      {pending && (
                        <span className={cn("num w-40 text-right text-muted-foreground", after < 0 && "font-medium text-rejected")}>
                          {fmtNum(s.available)} → {fmtNum(after)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}

          <Panel className="overflow-hidden">
            <PanelHeader
              title={req.type === "STOCK_MASTER" ? "New items" : "Lines"}
              description={`${req.type === "STOCK_MASTER" ? count(req.lineCount, "item") : count(req.lineCount, "line")}, ${count(req.totalQty, "unit")}`}
            />
            {table}
            {req.lineCount > LINES_PER_PAGE && <Pager page={page} pageSize={LINES_PER_PAGE} total={req.lineCount} params={{}} path={`/requests/${id}`} />}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel>
            <h2 className="border-b px-5 py-4 text-[15px] font-semibold">Summary</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 px-5 py-4 text-sm">
              <dt className="text-muted-foreground">Created by</dt>
              <dd className="text-right">{req.createdBy.name}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="text-right">{fmtDate(req.createdAt)}</dd>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="text-right">{fmtDateTime(req.submittedAt)}</dd>
              <dt className="text-muted-foreground">Approval levels</dt>
              <dd className="text-right">{req.status === "DRAFT" ? `${settings.approvalLevels} (set on submit)` : `${req.currentLevel} of ${req.requiredLevel} done`}</dd>
              {req.remarks && (
                <>
                  <dt className="text-muted-foreground">Remarks</dt>
                  <dd className="text-right">{req.remarks}</dd>
                </>
              )}
            </dl>
          </Panel>

          <Panel>
            <h2 className="border-b px-5 py-4 text-[15px] font-semibold">Approval history</h2>
            <ol className="flex flex-col px-5 py-4">
              <li className="relative flex gap-3 pb-5">
                <span className="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-muted-foreground bg-card" />
                <span className="absolute top-3 left-[4.5px] h-full w-px bg-border" aria-hidden />
                <div className="flex flex-col text-sm">
                  <span>
                    <span className="font-medium">{req.createdBy.name}</span> created the draft
                  </span>
                  <time className="text-xs text-muted-foreground">{fmtDateTime(req.createdAt)}</time>
                </div>
              </li>
              {req.events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                  <span className={cn("relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full", ACTION[e.action].dot)} />
                  {i < req.events.length - 1 && <span className="absolute top-3 left-[4.5px] h-full w-px bg-border" aria-hidden />}
                  <div className="flex min-w-0 flex-col text-sm">
                    <span>
                      {ACTION[e.action].label} by <span className="font-medium">{e.actor.name}</span>
                      {e.level > 0 && ` at level ${e.level}`}
                    </span>
                    <time className="text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</time>
                    {e.remarks && <p className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-[13px]">{e.remarks}</p>}
                  </div>
                </li>
              ))}
              {req.status === "SUBMITTED" && (
                <li className="relative flex gap-3">
                  <span className="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-dashed border-pending bg-card" />
                  <span className="text-sm text-muted-foreground">Waiting for level {level}: {level === 1 ? "a Manager or Management Authority" : "a Management Authority"}</span>
                </li>
              )}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  )
}

