import type { Metadata } from "next"
import { requirePermission } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { PageHeader, Panel } from "@/components/app/page-header"
import { WorkflowForm } from "@/components/app/workflow-form"

export const metadata: Metadata = { title: "Approval rules" }

export default async function Workflow() {
  await requirePermission("admin:manage")
  const s = await getSettings()
  return (
    <div className="max-w-3xl">
      <PageHeader title="Approval rules" description="How many sign-offs a request needs and how strictly stock is guarded. Changes apply to new submissions; requests already in review keep the levels they started with." />
      <Panel className="p-6">
        <WorkflowForm initial={s} />
      </Panel>
    </div>
  )
}
