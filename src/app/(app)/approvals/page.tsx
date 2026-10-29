import type { Metadata } from "next"
import Link from "next/link"
import { ClipboardCheckIcon } from "lucide-react"
import { prisma } from "@/lib/db"
import { rolesForLevel } from "@/lib/roles"
import { requirePermission } from "@/lib/server/session"
import { getSettings } from "@/lib/server/settings"
import { isOverdue, shortfallsForRequests } from "@/lib/server/workflow"
import { fmtDateTime } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel, PanelHeader } from "@/components/app/page-header"
import { ApprovalQueue, type QueueRow } from "@/components/app/approval-queue"
import { typeLabel } from "@/components/app/status-badge"

export const metadata: Metadata = { title: "Approvals" }

export default async function Approvals() {
  const user = await requirePermission("request:approve")
  const settings = await getSettings()
  const [pending, mine] = await Promise.all([
    prisma.request.findMany({
      where: { status: "SUBMITTED", createdById: { not: user.id } },
      include: { createdBy: true, events: { where: { action: "APPROVED" } } },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.approvalEvent.findMany({ where: { actorId: user.id, action: { in: ["APPROVED", "REJECTED"] } }, include: { request: true }, orderBy: { createdAt: "desc" }, take: 15 }),
  ])
  const actionable = pending.filter((r) => rolesForLevel(r.currentLevel + 1).includes(user.role))
  // One batched query for every request's stock shortfalls (it used to be one transaction per request).
  const shortMap = settings.preventNegativeStock ? await shortfallsForRequests(actionable.filter((r) => r.type === "DISTRIBUTION").map((r) => r.id)) : new Map<string, number>()
  const rows: QueueRow[] = []
  for (const r of actionable) {
    rows.push({
      id: r.id, number: r.number, title: r.title, type: typeLabel(r.type), maker: r.createdBy.name, submitted: fmtDateTime(r.submittedAt),
      ageHours: r.submittedAt ? Math.floor((Date.now() - r.submittedAt.getTime()) / 3600_000) : 0, overdue: isOverdue(r.submittedAt, settings.escalationHours),
      level: r.currentLevel + 1, required: r.requiredLevel, units: r.totalQty, lines: r.lineCount, shortfalls: shortMap.get(r.id) ?? 0,
      approvedEarlierByMe: r.events.some((e) => e.actorId === user.id && r.submittedAt && e.createdAt >= r.submittedAt),
    })
  }
  const others = pending.length - actionable.length

  return (
    <>
      <PageHeader
        title="Approvals"
        description={`Requests waiting for your decision, oldest first. Anything waiting over ${settings.escalationHours} hours is flagged. You can't approve requests you created.`}
      />
      <Panel className="overflow-hidden">
        {rows.length ? (
          <ApprovalQueue rows={rows} />
        ) : (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardCheckIcon />
              </EmptyMedia>
              <EmptyTitle>You&apos;re all caught up</EmptyTitle>
              <EmptyDescription>
                {others > 0 ? `${others} request${others > 1 ? "s are" : " is"} waiting at a level your role doesn't approve.` : "New submissions will appear here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </Panel>

      <Panel className="mt-6 overflow-hidden">
        <PanelHeader title="Your recent decisions" />
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Request</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead className="hidden md:table-cell">Remarks</TableHead>
              <TableHead className="pr-5 text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mine.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="pl-5">
                  <Link href={`/requests/${e.requestId}`} className="flex flex-col hover:text-primary">
                    <span className="font-medium">{e.request.title}</span>
                    <span className="num text-xs text-muted-foreground">{e.request.number}</span>
                  </Link>
                </TableCell>
                <TableCell className={e.action === "APPROVED" ? "text-approved" : "text-rejected"}>
                  {e.action === "APPROVED" ? "Approved" : "Returned"}{e.level ? ` at level ${e.level}` : ""}
                </TableCell>
                <TableCell className="hidden max-w-72 truncate text-muted-foreground md:table-cell">{e.remarks ?? "—"}</TableCell>
                <TableCell className="pr-5 text-right whitespace-nowrap text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
              </TableRow>
            ))}
            {!mine.length && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">You haven&apos;t decided on any requests yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
    </>
  )
}
