import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/server/session"
import { getLookups } from "@/lib/server/lookups"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader, Panel } from "@/components/app/page-header"
import { StockItemForm } from "@/components/app/stock-item-form"

export const metadata: Metadata = { title: "Edit stock item" }

export default async function EditStockItem({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const item = await prisma.stockItem.findUnique({ where: { id }, include: { request: true } })
  if (!item || item.status === "INACTIVE") notFound()
  const canEdit =
    user.role === "ADMIN" || (item.status === "DRAFT" && item.createdById === user.id && ["DRAFT", "REJECTED"].includes(item.request?.status ?? ""))
  if (!canEdit) redirect(`/stock/${id}`)
  const l = await getLookups()
  if (!l.categories.some((c) => c.value === item.categoryId)) l.categories.push({ value: item.categoryId, label: "Current category (disabled)" })
  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit stock item" description={`${item.code} · ${item.name}`} />
      {item.status === "ACTIVE" && (
        <Alert className="mb-6">
          <AlertTitle>Administrator override</AlertTitle>
          <AlertDescription>This item is approved. Your changes to its details are recorded in the audit log with the previous values.</AlertDescription>
        </Alert>
      )}
      <Panel className="p-6">
        <StockItemForm
          id={item.id}
          quantityLocked={item.status !== "DRAFT"}
          categories={l.categories}
          units={l.units.includes(item.unit) ? l.units : [item.unit, ...l.units]}
          locations={item.location && !l.locations.includes(item.location) ? [item.location, ...l.locations] : l.locations}
          initial={{
            code: item.code, name: item.name, product: item.product, categoryId: item.categoryId, size: item.size ?? "", color: item.color ?? "", brand: item.brand ?? "",
            unit: item.unit, location: item.location ?? "", unitCost: item.unitCost ? Number(item.unitCost) : "", reorderLevel: item.reorderLevel, openingQty: item.openingQty,
          }}
        />
      </Panel>
    </div>
  )
}
