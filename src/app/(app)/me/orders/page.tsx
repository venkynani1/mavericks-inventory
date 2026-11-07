import type { Metadata } from "next"
import Link from "next/link"
import { ShoppingBagIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { myEmployee } from "@/lib/server/portal"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader } from "@/components/app/page-header"
import { PortalUnlinked } from "@/components/app/portal-unlinked"
import { OrderCard } from "@/components/app/store-display"
import { CancelOrderButton } from "@/components/app/store-forms"

export const metadata: Metadata = { title: "My orders" }

export default async function MyOrders() {
  const { employeeId } = await myEmployee()
  if (!employeeId) return <PortalUnlinked />
  const orders = await prisma.redemptionOrder.findMany({ where: { employeeId }, include: { lines: true }, orderBy: { createdAt: "desc" }, take: 100 })
  const open = orders.filter((o) => o.status === "PLACED" || o.status === "ACCEPTED")
  const closed = orders.filter((o) => !(o.status === "PLACED" || o.status === "ACCEPTED"))
  return (
    <>
      <PageHeader title="My orders" description="Goodies you've ordered from the points store, and where and when to collect them." actions={<Button asChild><Link href="/me/store"><ShoppingBagIcon data-icon="inline-start" />Points store</Link></Button>} />
      {orders.length === 0 ? (
        <Empty className="rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShoppingBagIcon /></EmptyMedia>
            <EmptyTitle>No orders yet</EmptyTitle>
            <EmptyDescription>When you have enough points, pick a goodie in the store and place an order.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button asChild><Link href="/me/store">Open the store</Link></Button></EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {open.length > 0 && (
            <section aria-labelledby="open-h" className="flex flex-col gap-3">
              <h2 id="open-h" className="font-heading text-lg font-semibold">In progress</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {open.map((o) => <OrderCard key={o.id} o={o} actions={o.status === "PLACED" ? <div><CancelOrderButton id={o.id} number={o.number} /></div> : undefined} />)}
              </div>
            </section>
          )}
          {closed.length > 0 && (
            <section aria-labelledby="past-h" className="flex flex-col gap-3">
              <h2 id="past-h" className="font-heading text-lg font-semibold">Earlier orders</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {closed.map((o) => <OrderCard key={o.id} o={o} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  )
}
