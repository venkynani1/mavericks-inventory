import type { Metadata } from "next"
import { employeeOverview } from "@/lib/server/employee-data"
import { myEmployee } from "@/lib/server/portal"
import { getSettings } from "@/lib/server/settings"
import { AwardsPanel, GoodiesPanel, RewardsPanel } from "@/components/app/employee-sections"
import { PortalUnlinked } from "@/components/app/portal-unlinked"
import { PageHeader } from "@/components/app/page-header"


export const metadata: Metadata = { title: "Goodies received" }

export default async function MyGoodies() {
  const [{ employeeId }, settings] = await Promise.all([myEmployee(), getSettings()])
  const data = employeeId ? await employeeOverview(employeeId) : null
  if (!data) return <PortalUnlinked />
  return (
    <>
      <PageHeader title="Goodies received" description="Rewards you've earned through points, and every goodie handed to you." />
      <div className="flex flex-col gap-5">
        <AwardsPanel data={data} />
        {settings.rewardMode === "milestones" || data.rewards.length > 0 ? <RewardsPanel data={data} step={settings.rewards.step} /> : null}
        <GoodiesPanel data={data} />
      </div>
    </>
  )
}
