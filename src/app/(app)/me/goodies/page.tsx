import type { Metadata } from "next"
import { employeeOverview } from "@/lib/server/employee-data"
import { myEmployee } from "@/lib/server/portal"
import { getSettings } from "@/lib/server/settings"
import { AwardsPanel, GoodiesPanel, RewardsPanel } from "@/components/app/employee-sections"
import { PortalUnlinked } from "@/components/app/portal-unlinked"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { fmtDate, fmtNum } from "@/lib/utils"

function CollectedPanel({ orders }: { orders: { id: string; number: string; totalPoints: number; collectedAt: Date | null; lines: { id: string; name: string; quantity: number }[] }[] }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="From the points store" description="Goodies you ordered with your points and collected." />
      <ul className="divide-y text-sm">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
            <span className="flex-1">{o.lines.map((l) => `${l.name}${l.quantity > 1 ? ` x${l.quantity}` : ""}`).join(", ")}</span>
            <span className="num text-muted-foreground">{fmtNum(o.totalPoints)} pts</span>
            <span className="num text-muted-foreground">{o.collectedAt ? fmtDate(o.collectedAt) : ""}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

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
        {data.orders.some((o) => o.status === "COLLECTED") && <CollectedPanel orders={data.orders.filter((o) => o.status === "COLLECTED")} />}
        <GoodiesPanel data={data} />
      </div>
    </>
  )
}
