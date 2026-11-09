import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { eventAllocation } from "@/lib/server/event-goodies"
import { requirePermission } from "@/lib/server/session"
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/utils"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { AutoRefresh, ClaimActions, DeskControls } from "@/components/app/claim-forms"

export const metadata: Metadata = { title: "Goodies desk" }

export default async function DeskPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("rewards:operate")
  const { id } = await params
  const event = await prisma.event.findUnique({ where: { id } })
  if (!event) notFound()
  const [alloc, pending, handed] = await Promise.all([
    eventAllocation(prisma, id),
    prisma.eventClaim.findMany({ where: { eventId: id, status: "PENDING" }, include: { employee: true, stockItem: true }, orderBy: { createdAt: "asc" } }),
    prisma.eventClaim.findMany({ where: { eventId: id, status: { in: ["HANDED", "REJECTED"] } }, include: { employee: true, stockItem: true }, orderBy: { decidedAt: "desc" }, take: 50 }),
  ])
  const h = await headers()
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`
  const url = event.claimToken ? `${origin}/claim/${event.claimToken}` : null
  const svg = url && event.claimOpen ? await QRCode.toString(url, { type: "svg", margin: 1, width: 320, errorCorrectionLevel: "M" }) : null
  const current = alloc.find((a) => a.stockItemId === event.claimStockItemId)
  const handedCount = handed.filter((c) => c.status === "HANDED").reduce((s, c) => s + c.quantity, 0)

  return (
    <>
      <AutoRefresh />
      <Link href={`/events/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" />{event.name}</Link>
      <PageHeader title="Goodies desk" description={`${event.name}, ${fmtDate(event.date)}. Employees scan the QR code, enter their employee ID and name, and you hand the goodie over here. It comes out of the goodies approved for this event, and they're marked present.`} />
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <Panel className="flex flex-col gap-4 p-5">
          {svg ? (
            <>
              <div className="mx-auto w-full max-w-72 rounded-xl bg-white p-3 [&>svg]:h-auto [&>svg]:w-full" aria-label="QR code for collecting goodies" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
              <p className="text-center text-sm">Scan to collect <span className="font-semibold">{current?.name ?? "your goodie"}</span>{event.claimQty > 1 ? ` x${event.claimQty}` : ""}</p>
              <p className="text-center text-xs break-all text-muted-foreground">{url}</p>
              {current && <p className="num text-center text-sm text-muted-foreground">{fmtNum(current.remaining)} left, {fmtNum(current.claimsWaiting)} waiting, {fmtNum(current.collected)} handed out</p>}
            </>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">The desk is closed. Choose a goodie and open it to show the QR code.</p>
          )}
          {alloc.some((a) => a.approved > 0) ? (
            <DeskControls eventId={id} open={event.claimOpen} stockItemId={event.claimStockItemId} qty={event.claimQty} options={alloc.filter((a) => a.approved > 0).map((a) => ({ id: a.stockItemId, name: a.name, remaining: a.remaining }))} />
          ) : (
            <p className="text-sm text-rejected">No goodies are approved for this event yet. On the event page, request goodies and get them approved first.</p>
          )}
        </Panel>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="overflow-hidden">
            <PanelHeader title={`Waiting at the desk (${pending.length})`} description="Check the person in front of you, then hand the goodie over. Updates every few seconds." />
            <ul className="divide-y">
              {pending.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{c.employee.name} <span className="num text-sm font-normal text-muted-foreground">{c.employee.empId}</span></span>
                    <span className="text-xs text-muted-foreground">{c.stockItem.name}{c.quantity > 1 ? ` x${c.quantity}` : ""}, {fmtDateTime(c.createdAt)}{c.employee.location ? `, ${c.employee.location}` : ""}</span>
                    {!c.nameMatches && <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-pending"><TriangleAlertIcon className="size-3.5" />Typed &ldquo;{c.nameEntered}&rdquo;, which doesn&apos;t match the Fusion name. Check their ID card.</span>}
                  </div>
                  <ClaimActions id={c.id} name={c.employee.name} />
                </li>
              ))}
              {!pending.length && <li className="px-5 py-6 text-center text-sm text-muted-foreground">Nobody waiting.</li>}
            </ul>
          </Panel>
          <Panel className="overflow-hidden">
            <PanelHeader title={`Handed over (${fmtNum(handedCount)})`} description="Latest first. Each person also sees it under Goodies received." />
            <ul className="divide-y text-sm">
              {handed.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-2">
                  <span className="flex-1">{c.employee.name} <span className="num text-muted-foreground">{c.employee.empId}</span></span>
                  <span className="text-muted-foreground">{c.stockItem.name}{c.quantity > 1 ? ` x${c.quantity}` : ""}</span>
                  <span className={c.status === "HANDED" ? "text-xs font-medium text-approved" : "text-xs font-medium text-rejected"}>{c.status === "HANDED" ? "Handed over" : "Rejected"}</span>
                </li>
              ))}
              {!handed.length && <li className="px-5 py-6 text-center text-muted-foreground">None yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  )
}
