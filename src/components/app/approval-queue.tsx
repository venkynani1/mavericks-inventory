"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckIcon } from "lucide-react"
import { approveMany } from "@/app/actions/requests"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, count, fmtNum } from "@/lib/utils"

export type QueueRow = {
  id: string
  number: string
  title: string
  type: string
  maker: string
  submitted: string
  ageHours: number
  overdue: boolean
  level: number
  required: number
  units: number
  lines: number
  shortfalls: number
  approvedEarlierByMe: boolean
}

export function ApprovalQueue({ rows }: { rows: QueueRow[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const router = useRouter()
  const selectable = rows.filter((r) => !r.shortfalls && !r.approvedEarlierByMe)
  const all = selectable.length > 0 && selectable.every((r) => sel.has(r.id))
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  return (
    <div>
      <div className="flex min-h-12 items-center gap-3 border-b px-5 py-2">
        <span className="text-sm text-muted-foreground">{sel.size ? `${sel.size} selected` : "Open a request to review its lines, or select several to approve together."}</span>
        {sel.size > 0 && (
          <Button
            size="sm"
            className="ml-auto"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await approveMany([...sel])
                if (!r.ok) return void toast.error(r.error)
                const failed = r.data?.filter((x) => !x.ok) ?? []
                const ok = (r.data?.length ?? 0) - failed.length
                if (ok) toast.success(`Approved ${ok} request${ok > 1 ? "s" : ""}`)
                failed.forEach((f) => toast.error(f.error))
                setSel(new Set())
                router.refresh()
              })
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
            Approve {sel.size} selected
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 pl-5">
              <Checkbox aria-label="Select all requests that can be approved" checked={all} disabled={!selectable.length} onCheckedChange={(c) => setSel(c ? new Set(selectable.map((r) => r.id)) : new Set())} />
            </TableHead>
            <TableHead>Request</TableHead>
            <TableHead className="hidden md:table-cell">From</TableHead>
            <TableHead>Waiting</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="pr-5">Check</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const blocked = r.shortfalls > 0 || r.approvedEarlierByMe
            return (
              <TableRow key={r.id} data-state={sel.has(r.id) ? "selected" : undefined}>
                <TableCell className="pl-5">
                  <Checkbox aria-label={`Select ${r.number}`} checked={sel.has(r.id)} disabled={blocked} onCheckedChange={() => toggle(r.id)} />
                </TableCell>
                <TableCell className="max-w-0 sm:max-w-none">
                  <Link href={`/requests/${r.id}`} className="flex flex-col hover:text-primary">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="num text-xs text-muted-foreground">
                      {r.type} {r.number}, level {r.level} of {r.required}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{r.maker}</TableCell>
                <TableCell className={cn("whitespace-nowrap", r.overdue ? "font-medium text-pending" : "text-muted-foreground")}>
                  {r.ageHours < 24 ? `${r.ageHours} h` : `${Math.floor(r.ageHours / 24)} d ${r.ageHours % 24} h`}
                </TableCell>
                <TableCell className="num text-right">
                  {fmtNum(r.units)}
                  <span className="block text-xs text-muted-foreground">{count(r.lines, "line")}</span>
                </TableCell>
                <TableCell className="pr-5 text-sm">
                  {r.approvedEarlierByMe ? (
                    <span className="text-muted-foreground">Needs another approver</span>
                  ) : r.shortfalls ? (
                    <span className="text-rejected">{r.shortfalls} item{r.shortfalls > 1 ? "s" : ""} short</span>
                  ) : (
                    <span className="text-approved">Stock available</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
