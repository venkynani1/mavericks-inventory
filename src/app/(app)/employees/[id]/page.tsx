import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, Building2Icon, MailIcon, MapPinIcon, TrophyIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { can } from "@/lib/roles"
import { employeeOverview } from "@/lib/server/employee-data"
import { requirePermission } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { fmtNum, initials } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/app/page-header"
import { PointsProgress } from "@/components/app/rewards-display"
import { AdjustPointsDialog, EmployeeDialog, ResetPointsDialog } from "@/components/app/rewards-forms"
import { AwardsPanel, EventsAttendedPanel, GoodiesPanel, HistoryPanel, RewardsPanel } from "@/components/app/employee-sections"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await prisma.employee.findUnique({ where: { id: (await params).id }, select: { name: true } })
  return { title: e?.name ?? "Employee" }
}

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("rewards:view")
  const [{ id }, sp, settings] = await Promise.all([params, searchParams, getSettings()])
  const data = await employeeOverview(id)
  if (!data) notFound()
  const { emp } = data
  const configure = can(user.role, "rewards:configure")
  const statuses = Object.fromEntries(data.rewards.filter((r) => r.cycle === emp.cycle).map((r) => [r.threshold, r.status]))

  return (
    <>
      <Link href="/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Employees
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-primary text-base font-semibold text-primary-foreground">{initials(emp.name)}</span>
            <span className="flex flex-col">
              {emp.name}
              <span className="num text-sm font-normal text-muted-foreground">{emp.empId}{emp.designation ? `, ${emp.designation}` : ""}{!emp.active ? " (inactive)" : ""}</span>
            </span>
          </span>
        }
        actions={
          <>
            {(can(user.role, "rewards:operate") || configure) && <EmployeeDialog employee={{ id: emp.id, empId: emp.empId, name: emp.name, email: emp.email ?? "", department: emp.department ?? "", designation: emp.designation ?? "", location: emp.location ?? "", active: emp.active }} />}
            {configure && <AdjustPointsDialog employeeId={emp.id} name={emp.name} points={emp.points} cap={settings.rewards.cap} />}
            {configure && <ResetPointsDialog employeeId={emp.id} name={emp.name} points={emp.points} />}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {emp.department && <span className="inline-flex items-center gap-1.5"><Building2Icon className="size-4" />{emp.department}</span>}
          {emp.location && <span className="inline-flex items-center gap-1.5"><MapPinIcon className="size-4" />{emp.location}</span>}
          {emp.email && <span className="inline-flex items-center gap-1.5"><MailIcon className="size-4" />{emp.email}</span>}
        </div>
      </PageHeader>

      <Panel className="mb-5 grid gap-6 p-5 lg:grid-cols-[14rem_1fr]">
        <div className="grid grid-cols-3 gap-4 lg:grid-cols-1">
          <div><p className="text-sm text-muted-foreground">Current points</p><p className="num font-heading text-3xl font-semibold">{fmtNum(emp.points)}</p></div>
          <div><p className="text-sm text-muted-foreground">Lifetime</p><p className="num text-lg font-semibold">{fmtNum(emp.lifetimePoints)}</p></div>
          <div><p className="text-sm text-muted-foreground">Rank</p><p className="num inline-flex items-center gap-1.5 text-lg font-semibold"><TrophyIcon className="size-4 text-reward" />{emp.points > 0 ? `#${fmtNum(data.rank)}` : "—"}</p></div>
        </div>
        <PointsProgress points={emp.points} rules={settings.rewards} statuses={statuses} />
      </Panel>

      <div className="flex flex-col gap-5">
        <RewardsPanel data={data} staff step={settings.rewards.step} />
        <div className="grid gap-5 xl:grid-cols-2">
          <HistoryPanel data={data} staff limit={sp.tab === "history" ? undefined : 12} />
          <div className="flex flex-col gap-5">
            <AwardsPanel data={data} staff hideEmpty />
            <EventsAttendedPanel data={data} staff limit={10} />
            <GoodiesPanel data={data} staff />
          </div>
        </div>
      </div>
    </>
  )
}
