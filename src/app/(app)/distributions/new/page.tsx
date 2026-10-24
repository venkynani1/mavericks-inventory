import type { Metadata } from "next"
import { requirePermission } from "@/lib/server/session"
import { getLookups } from "@/lib/server/lookups"
import { pickableItems } from "@/lib/server/pick-items"
import { PageHeader } from "@/components/app/page-header"
import { DistributionForm } from "@/components/app/distribution-form"

export const metadata: Metadata = { title: "Record a distribution" }

export default async function NewDistribution({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const user = await requirePermission("request:create")
  const [{ purposes, locations }, items, { item }] = await Promise.all([getLookups(), pickableItems(), searchParams])
  return (
    <>
      <PageHeader title="Record a distribution" description="List who received what. A manager approves the request, then the quantities come off the shelf." />
      <DistributionForm items={items} purposes={purposes} locations={locations} defaultItem={item} me={user.name} />
    </>
  )
}
