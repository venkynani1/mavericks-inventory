import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/server/session"
import { PageHeader } from "@/components/app/page-header"
import { MasterList } from "@/components/app/masters"

export const metadata: Metadata = { title: "Master data" }

export default async function Masters() {
  await requirePermission("admin:manage")
  const [cats, lookups] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { items: true } } } }),
    prisma.lookup.findMany({ orderBy: [{ sortOrder: "asc" }, { value: "asc" }] }),
  ])
  const of = (k: string) => lookups.filter((l) => l.kind === k).map((l) => ({ id: l.id, label: l.value, active: l.active }))
  return (
    <>
      <PageHeader title="Master data" description="The lists people choose from in forms and uploads. Disabling a value hides it from new entries without touching existing records." />
      <div className="grid gap-6 lg:grid-cols-2">
        <MasterList kind="CATEGORY" title="Categories" description="Groups items on the stock page and in reports." rows={cats.map((c) => ({ id: c.id, label: c.name, active: c.active, meta: `${c._count.items} items` }))} />
        <MasterList kind="PURPOSE" title="Purposes" description="Why stock was handed out, such as onboarding or an event." rows={of("PURPOSE")} />
        <MasterList kind="LOCATION" title="Locations" description="Offices where stock is kept or delivered." rows={of("LOCATION")} />
        <MasterList kind="UNIT" title="Units" description="Units of measure for stock items." rows={of("UNIT")} />
      </div>
    </>
  )
}
