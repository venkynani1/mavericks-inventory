import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/server/session"
import { PageHeader } from "@/components/app/page-header"
import { CountSheet } from "@/components/app/count-sheet"

export const metadata: Metadata = { title: "New stock count" }

export default async function NewCount() {
  await requirePermission("request:create")
  const items = await prisma.stockItem.findMany({ where: { status: "ACTIVE" }, include: { category: true }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] })
  return (
    <>
      <Link href="/counts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" /> Stock counts</Link>
      <PageHeader title="New stock count" description="Count what's physically on the shelf. Only differences are sent for approval, each with a reason; approval adjusts available stock and records it on the ledger." />
      <CountSheet items={items.map((i) => ({ id: i.id, code: i.code, name: i.name, category: i.category.name, location: i.location, available: i.availableQty }))} categories={[...new Set(items.map((i) => i.category.name))]} />
    </>
  )
}
