import type { Metadata } from "next"
import { ActivityIcon, CheckCircle2Icon, CloudIcon, DatabaseIcon, GaugeIcon, TriangleAlertIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/server/session"
import { systemReport } from "@/lib/server/system"
import { fmtNum } from "@/lib/utils"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { Kpi } from "@/components/app/rewards-display"

export const metadata: Metadata = { title: "System status" }
export const dynamic = "force-dynamic"

export default async function SystemStatus() {
  await requirePermission("admin:manage")
  const [r, counts] = await Promise.all([
    systemReport(),
    prisma.$queryRaw<{ items: number; requests: number; ledger: number; employees: number; events: number; audit: number }[]>`
      SELECT (SELECT count(*)::int FROM "StockItem") AS items, (SELECT count(*)::int FROM "Request") AS requests, (SELECT count(*)::int FROM "LedgerEntry") AS ledger,
             (SELECT count(*)::int FROM "Employee") AS employees, (SELECT count(*)::int FROM "Event") AS events, (SELECT count(*)::int FROM "AuditLog") AS audit`,
  ])
  const c = counts[0]
  const tone = r.latencyMs === null ? "danger" : r.latencyMs > 60 ? "danger" : r.latencyMs > 25 ? "warn" : "good"
  return (
    <>
      <PageHeader title="System status" description="Where the application and its database are running, and how quickly they talk to each other. Share this page with IT if users say the app is slow." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Database" value={r.dbOk ? "Reachable" : "Unreachable"} icon={r.dbOk ? <CheckCircle2Icon /> : <TriangleAlertIcon />} tone={r.dbOk ? "good" : "danger"} />
        <Kpi label="Database round trip" value={r.latencyMs === null ? "—" : `${r.latencyMs} ms`} hint="Under 10 ms is ideal; over 50 ms feels slow" icon={<GaugeIcon />} tone={tone} />
        <Kpi label="App runs in" value={r.app.region ?? "Unknown"} hint={[r.app.host, r.app.city].filter(Boolean).join(", ")} icon={<CloudIcon />} />
        <Kpi label="Database runs in" value={r.db.region ?? "Unknown"} hint={r.db.provider} icon={<DatabaseIcon />} tone={r.sameRegion === false ? "warn" : undefined} />
      </div>
      {r.advice.length > 0 && (
        <Panel className="mb-5 border-pending/40 bg-pending-soft/40">
          <PanelHeader title="How to make it faster" />
          <ul className="flex list-disc flex-col gap-2 py-4 pr-5 pl-10 text-sm">
            {r.advice.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </Panel>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Environment" />
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 p-5 text-sm">
            <dt className="text-muted-foreground">Hosting</dt><dd>{r.app.host}</dd>
            <dt className="text-muted-foreground">App region</dt><dd>{r.app.region ?? "Not reported"}{r.app.cloud ? ` (${r.app.cloud})` : ""}</dd>
            <dt className="text-muted-foreground">Database</dt><dd>{r.db.provider}</dd>
            <dt className="text-muted-foreground">Database host</dt><dd className="break-all">{r.db.host}</dd>
            <dt className="text-muted-foreground">Same region</dt><dd>{r.sameRegion === null ? "Can't tell" : r.sameRegion ? "Yes" : "No"}</dd>
            <dt className="text-muted-foreground">Node.js</dt><dd>{r.node}</dd>
            <dt className="text-muted-foreground">Version</dt><dd>{r.commit ?? "Not reported"}</dd>
            <dt className="text-muted-foreground">Assistant</dt><dd>{process.env.ANTHROPIC_API_KEY ? `Claude (${process.env.ASSISTANT_MODEL || "claude-haiku-5-5"})` : "Built-in answers (no API key set)"}</dd>
            <dt className="text-muted-foreground">Single sign-on</dt><dd>{process.env.SSO_ISSUER ? `On (${process.env.SSO_PROVIDER_NAME || "Microsoft"})` : "Off"}</dd>
          </dl>
        </Panel>
        <Panel>
          <PanelHeader title="Data" description="Row counts" />
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-3">
            {Object.entries({ "Stock items": c.items, Requests: c.requests, "Ledger entries": c.ledger, Employees: c.employees, Events: c.events, "Audit entries": c.audit }).map(([k, v]) => (
              <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="num mt-0.5 text-lg font-semibold">{fmtNum(v)}</dd></div>
            ))}
          </dl>
          <p className="flex items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground"><ActivityIcon className="size-3.5" />Health check for monitors: <code>/api/health</code></p>
        </Panel>
      </div>
    </>
  )
}
