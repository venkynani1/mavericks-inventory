import type { Metadata } from "next"
import { requirePermission } from "@/lib/server/session"
import { pickableItems } from "@/lib/server/pick-items"
import { PageHeader } from "@/components/app/page-header"
import { ReceiptForm } from "@/components/app/receipt-form"

export const metadata: Metadata = { title: "Record stock inward" }

export default async function NewReceipt({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  await requirePermission("request:create")
  const [items, { item }] = await Promise.all([pickableItems(), searchParams])
  return (
    <>
      <PageHeader title="Record stock inward" description="Log a delivery against existing items. For brand-new products, add them under Stock first." />
      <ReceiptForm items={items} defaultItem={item} />
    </>
  )
}
