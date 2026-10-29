import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { fmtNum } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { CategoryBadge } from "@/components/app/rewards-display"
import { EventTypeDialog, MilestoneDialog, ResetAllDialog, RewardRulesForm } from "@/components/app/rewards-forms"

export const metadata: Metadata = { title: "Points and rewards rules" }

export default async function RewardRulesPage() {
  await requirePermission("rewards:configure")
  const [settings, types, milestones, items, withPoints, dueBy] = await Promise.all([
    getSettings(),
    prisma.eventType.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { events: true } } } }),
    prisma.rewardMilestone.findMany({ where: { active: true }, orderBy: { threshold: "asc" }, include: { stockItem: { select: { name: true, availableQty: true } } } }),
    prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, availableQty: true }, orderBy: { name: "asc" } }),
    prisma.employee.count({ where: { points: { gt: 0 } } }),
    prisma.rewardEarned.groupBy({ by: ["threshold"], where: { status: "DUE" }, _count: true }),
  ])
  const due = new Map(dueBy.map((d) => [d.threshold, d._count]))

  return (
    <>
      <PageHeader title="Points and rewards rules" description="How many points each kind of event is worth, how often a goodie is earned, and which goodie each milestone gets. Every change is in the audit log." />
      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="overflow-hidden">
            <PanelHeader title="Points per event type" description="Executives pick a type when they create an event. They can override points for a single flagship event." actions={<EventTypeDialog />} />
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Events</TableHead>
                  <TableHead className="w-12 pr-5"><span className="sr-only">Edit</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id} className={t.active ? "" : "opacity-60"}>
                    <TableCell className="pl-5">
                      <div className="flex flex-col">
                        <span className="font-medium">{t.name}{!t.active && " (retired)"}</span>
                        {t.description && <span className="text-xs text-muted-foreground">{t.description}</span>}
                      </div>
                    </TableCell>
                    <TableCell><CategoryBadge category={t.category} /></TableCell>
                    <TableCell className="num text-right font-semibold">{fmtNum(t.points)}</TableCell>
                    <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{t._count.events}</TableCell>
                    <TableCell className="pr-5"><EventTypeDialog type={{ id: t.id, name: t.name, category: t.category, points: t.points, description: t.description ?? "", active: t.active }} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Milestone goodies" description="What people receive at each milestone. Leave it to be decided and the executive picks one per person when handing out." />
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Milestone</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Goodie</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Due now</TableHead>
                  <TableHead className="w-12 pr-5"><span className="sr-only">Edit</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="num pl-5 font-semibold">{fmtNum(m.threshold)}</TableCell>
                    <TableCell>{m.title}</TableCell>
                    <TableCell>
                      {m.stockItem ? (
                        <div className="flex flex-col">
                          <span>{m.stockItem.name}{m.quantity > 1 ? ` x${m.quantity}` : ""}</span>
                          <span className={`num text-xs ${m.stockItem.availableQty < (due.get(m.threshold) ?? 0) ? "text-rejected" : "text-muted-foreground"}`}>{fmtNum(m.stockItem.availableQty)} in stock</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">To be decided</span>
                      )}
                    </TableCell>
                    <TableCell className="num hidden text-right sm:table-cell">{due.get(m.threshold) ?? "—"}</TableCell>
                    <TableCell className="pr-5"><MilestoneDialog m={m} items={items} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </div>
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Milestones" description="Applies from the next points credited." />
            <RewardRulesForm step={settings.rewards.step} cap={settings.rewards.cap} leaderboard={settings.leaderboardForEmployees} />
          </Panel>
          <Panel className="border-rejected/30">
            <PanelHeader title="Start a new programme year" description="Resets every employee's points to zero. Earned rewards are kept." />
            <div className="p-5">
              <ResetAllDialog count={withPoints} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
