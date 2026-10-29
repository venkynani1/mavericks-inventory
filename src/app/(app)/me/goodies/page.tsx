import type { Metadata } from "next"
import { employeeOverview } from "@/lib/server/employee-data"
import { myEmployee } from "@/lib/server/portal"
import { getSettings } from "@/lib/server/settings"
import { PageHeader } from "@/components/app/page-header"
import { GoodiesPanel, RewardsPanel } from "@/components/app/employee-sections"
import { PortalUnlinked } from "@/components/app/portal-unlinked"

export const metadata: Metadata = { title: "Goodies received" }

export default async function MyGoodies() {
  const [{ employeeId }, settings] = await Promise.all([myEmployee(), getSettings()])
  const data = employeeId ? await employeeOverview(employeeId) : null
  if (!data) return <PortalUnlinked />
  return (
    <>
      <PageHeader title="Goodies received" description="Rewards you've earned through points, and every goodie handed to you." />
      <div className="flex flex-col gap-5">
        <RewardsPanel data={data} step={settings.rewards.step} />
        <GoodiesPanel data={data} />
      </div>
    </>
  )
}
