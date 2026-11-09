import type { Metadata } from "next"
import { CheckCircle2Icon, GiftIcon, HourglassIcon, XCircleIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { fmtDate } from "@/lib/utils"
import { Brand } from "@/components/app/brand"
import { AutoRefresh, ClaimForm } from "@/components/app/claim-forms"

export const metadata: Metadata = { title: "Collect your goodie", robots: { index: false } }
export const dynamic = "force-dynamic"

export default async function ClaimPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ c?: string }> }) {
  const { token } = await params
  const { c } = await searchParams
  const event = await prisma.event.findUnique({ where: { claimToken: token.slice(0, 64) } })
  const item = event?.claimStockItemId ? await prisma.stockItem.findUnique({ where: { id: event.claimStockItemId }, select: { name: true } }) : null
  const claim = c && event ? await prisma.eventClaim.findFirst({ where: { id: c, eventId: event.id }, include: { employee: { select: { name: true } }, stockItem: { select: { name: true } } } }) : null
  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Brand />
        {!event ? (
          <p className="rounded-xl border p-6 text-center">This QR code isn&apos;t valid. Ask the team at the desk.</p>
        ) : claim ? (
          <section className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center">
            {claim.status === "HANDED" ? <CheckCircle2Icon className="size-14 text-approved" /> : claim.status === "REJECTED" ? <XCircleIcon className="size-14 text-rejected" /> : <HourglassIcon className="size-14 text-pending" />}
            <h1 className="font-heading text-2xl font-semibold">
              {claim.status === "HANDED" ? "Enjoy your goodie!" : claim.status === "REJECTED" ? "Not handed over" : "Show this screen at the desk"}
            </h1>
            <p className="text-lg">{claim.employee.name}</p>
            <p className="text-muted-foreground">{claim.stockItem.name}{claim.quantity > 1 ? ` x${claim.quantity}` : ""}, {event.name}</p>
            {claim.status === "PENDING" && (
              <>
                <p className="text-sm text-muted-foreground">The team will hand it over and this page will update.</p>
                <AutoRefresh every={3000} />
              </>
            )}
            {claim.status === "HANDED" && <p className="text-sm text-muted-foreground">It&apos;s in your Mavericks portal under Goodies received.</p>}
            {claim.status === "REJECTED" && <p className="text-sm text-muted-foreground">Please speak to the team at the desk.</p>}
          </section>
        ) : !event.claimOpen ? (
          <p className="rounded-xl border p-6 text-center">The goodies desk for {event.name} is closed right now.</p>
        ) : (
          <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><GiftIcon className="size-6" /></span>
              <div>
                <h1 className="font-heading text-xl font-semibold">Collect your {item?.name ?? "goodie"}</h1>
                <p className="text-sm text-muted-foreground">{event.name}, {fmtDate(event.date)}</p>
              </div>
            </div>
            <ClaimForm token={token} />
            <p className="text-xs text-muted-foreground">One per person. Only active Hexaware employees. Your ID and name are checked against HR records.</p>
          </section>
        )}
      </div>
    </main>
  )
}
