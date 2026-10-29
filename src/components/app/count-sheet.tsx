"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { SearchIcon } from "lucide-react"
import { createStockCount } from "@/app/actions/requests"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, fmtNum } from "@/lib/utils"
import { Panel, PanelHeader } from "./page-header"

type Item = { id: string; code: string; name: string; category: string; location: string | null; available: number }
const REASONS = ["Miscount earlier", "Damaged", "Found extra", "Lost or missing", "Handed out without a request", "Other"]

/** Count sheet: type what's physically on the shelf; only differences become lines on the request. */
export function CountSheet({ items, categories }: { items: Item[]; categories: string[] }) {
  const [title, setTitle] = useState(`Cycle count ${new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date())}`)
  const [cat, setCat] = useState("all")
  const [q, setQ] = useState("")
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const shown = useMemo(() => items.filter((i) => (cat === "all" || i.category === cat) && (!q.trim() || `${i.name} ${i.code}`.toLowerCase().includes(q.trim().toLowerCase()))), [items, cat, q])
  const entered = items.filter((i) => counts[i.id] !== undefined && counts[i.id] !== "")
  const diffs = entered.filter((i) => Number(counts[i.id]) !== i.available)
  const net = diffs.reduce((s, i) => s + (Number(counts[i.id]) - i.available), 0)

  const save = (submit: boolean) =>
    start(async () => {
      setError(null)
      const r = await createStockCount({ title, submit, lines: diffs.map((i) => ({ stockItemId: i.id, countedQty: Number(counts[i.id]), reason: reasons[i.id] })) })
      if (!r.ok) return setError(r.error)
      toast.success(r.message)
      router.push(`/requests/${r.data!.id}`)
    })

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader title="Count details" />
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="cnt-title">Title</FieldLabel>
            <Input id="cnt-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="num flex gap-6 text-sm">
            <span><span className="block text-muted-foreground">Counted</span><span className="text-lg font-semibold">{entered.length}</span></span>
            <span><span className="block text-muted-foreground">Differences</span><span className={cn("text-lg font-semibold", diffs.length && "text-pending")}>{diffs.length}</span></span>
            <span><span className="block text-muted-foreground">Net change</span><span className={cn("text-lg font-semibold", net < 0 ? "text-rejected" : net > 0 ? "text-approved" : "")}>{net > 0 ? "+" : ""}{fmtNum(net)}</span></span>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="h-9 min-w-44 bg-card" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
          <InputGroup className="h-9 w-full bg-card sm:w-72">
            <InputGroupAddon><SearchIcon /></InputGroupAddon>
            <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…" aria-label="Find an item" />
          </InputGroup>
          <span className="ml-auto text-sm text-muted-foreground">Leave an item blank if you didn&apos;t count it.</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Item</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="text-right">System</TableHead>
              <TableHead className="w-32">Counted</TableHead>
              <TableHead className="w-20 text-right">Diff</TableHead>
              <TableHead className="hidden pr-5 lg:table-cell">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((i) => {
              const v = counts[i.id]
              const d = v === undefined || v === "" ? null : Number(v) - i.available
              return (
                <TableRow key={i.id} className={cn(d && "bg-pending-soft/40")}>
                  <TableCell className="max-w-0 pl-5 sm:max-w-none">
                    <div className="flex flex-col">
                      <span className="truncate font-medium">{i.name}</span>
                      <span className="num text-xs text-muted-foreground">{i.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{i.location ?? "—"}</TableCell>
                  <TableCell className="num text-right">{fmtNum(i.available)}</TableCell>
                  <TableCell>
                    <Input inputMode="numeric" aria-label={`Counted quantity for ${i.name}`} className="num h-8 text-right" value={v ?? ""} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value.replace(/[^0-9]/g, "") })} />
                  </TableCell>
                  <TableCell className={cn("num text-right font-medium", d && d < 0 ? "text-rejected" : d && d > 0 ? "text-approved" : "text-muted-foreground")}>{d === null ? "" : d === 0 ? "0" : `${d > 0 ? "+" : ""}${fmtNum(d)}`}</TableCell>
                  <TableCell className="hidden pr-5 lg:table-cell">
                    {d ? (
                      <Select value={reasons[i.id] ?? ""} onValueChange={(x) => setReasons({ ...reasons, [i.id]: x })}>
                        <SelectTrigger size="sm" className="w-52" aria-label={`Reason for ${i.name}`}><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                        <SelectContent><SelectGroup>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectGroup></SelectContent>
                      </Select>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Panel>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-7 md:px-7">
        {error ? <p role="alert" className="text-sm text-rejected">{error}</p> : <p className="text-sm text-muted-foreground">{diffs.length ? `${diffs.length} difference${diffs.length > 1 ? "s" : ""} will be sent for approval. Stock changes only when approved.` : "Enter counts to see differences."}</p>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" disabled={pending || !diffs.length} onClick={() => save(false)}>Save draft</Button>
          <Button disabled={pending || !diffs.length} onClick={() => save(true)}>{pending && <Spinner data-icon="inline-start" />}Submit for approval</Button>
        </div>
      </div>
    </div>
  )
}
