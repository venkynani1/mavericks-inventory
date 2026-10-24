import type { Metadata } from "next"
import { requirePermission } from "@/lib/server/session"
import { getLookups } from "@/lib/server/lookups"
import { PageHeader, Panel } from "@/components/app/page-header"
import { StockItemForm } from "@/components/app/stock-item-form"

export const metadata: Metadata = { title: "Add stock item" }

export default async function NewStockItem() {
  await requirePermission("stock:write")
  const l = await getLookups()
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add a stock item" description="New items go into a draft with your other unsubmitted items. Submit the draft when you're ready, and the opening quantity is added after approval." />
      <Panel className="p-6">
        <StockItemForm categories={l.categories} units={l.units} locations={l.locations} />
      </Panel>
    </div>
  )
}
