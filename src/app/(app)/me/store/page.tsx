import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/db"
import { myEmployee } from "@/lib/server/portal"
import { getSettings } from "@/lib/server/settings"
import { storeCatalogue } from "@/lib/server/store"
import { fmtNum } from "@/lib/utils"
import { PageHeader } from "@/components/app/page-header"
import { PortalUnlinked } from "@/components/app/portal-unlinked"
import { StoreFront } from "@/components/app/store-forms"

export const metadata: Metadata = { title: "Points store" }

export default async function StorePage() {
  const [{ employeeId }, settings] = await Promise.all([myEmployee(), getSettings()])
  if (!employeeId) return <PortalUnlinked />
  const [emp, items, openOrders, held] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { points: true } }),
    storeCatalogue({ activeOnly: true }),
    prisma.redemptionOrder.count({ where: { employeeId, status: { in: ["PLACED", "ACCEPTED"] } } }),
    prisma.redemptionLine.groupBy({ by: ["stockItemId"], where: { order: { status: "PLACED" } }, _sum: { quantity: true } }),
  ])
  if (!emp) return <PortalUnlinked />
  const heldBy = new Map(held.map((h) => [h.stockItemId, h._sum.quantity ?? 0]))
  return (
    <>
      <PageHeader
        title="Points store"
        description={
          settings.rewardMode === "store"
            ? `Spend your points on goodies, or keep saving for a bigger one. You have ${fmtNum(emp.points)} points.`
            : "The store is switched off. Goodies are handed out at each milestone instead."
        }
        actions={<Link href="/me/orders" className="text-sm text-primary hover:underline">My orders{openOrders ? ` (${openOrders} open)` : ""}</Link>}
      />
      {settings.rewardMode === "store" && (
        <StoreFront
          points={emp.points}
          openOrders={openOrders}
          products={items.map((i) => ({ id: i.id, name: i.name, description: i.description, pointsCost: i.pointsCost, inStock: Math.max(0, i.stockItem.availableQty - (heldBy.get(i.stockItemId) ?? 0)) }))}
        />
      )}
    </>
  )
}
