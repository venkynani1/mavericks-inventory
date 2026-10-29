import type { Metadata } from "next"
import { employeeOverview } from "@/lib/server/employee-data"
import { myEmployee } from "@/lib/server/portal"
import { PageHeader } from "@/components/app/page-header"
import { HistoryPanel } from "@/components/app/employee-sections"
import { PortalUnlinked } from "@/components/app/portal-unlinked"

export const metadata: Metadata = { title: "Points history" }

export default async function MyHistory() {
  const { employeeId } = await myEmployee()
  const data = employeeId ? await employeeOverview(employeeId) : null
  if (!data) return <PortalUnlinked />
  return (
    <>
      <PageHeader title="Points history" description="Every event, adjustment and reset that changed your points, newest first." />
      <HistoryPanel data={data} />
    </>
  )
}
