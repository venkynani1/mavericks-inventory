"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { BadgeCheckIcon, DownloadIcon, GiftIcon, PencilIcon, PlusCircleIcon, TicketIcon, TrophyIcon, UploadIcon, XCircleIcon } from "lucide-react"
import { addEventAward, cancelEventAward, distributeEventAwards, issueEventAwards, saveAwardPosition, uploadEvents, type EventUploadResult } from "@/app/actions/rewards"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, fmtDate, fmtNum } from "@/lib/utils"
import { POSITION_TONE } from "./rewards-display"

type Res<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string }

function useSubmit() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const submit = <T,>(fn: () => Promise<Res<T>>, onOk?: (r: Extract<Res<T>, { ok: true }>) => void) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (!r.ok) return setError(r.error)
      if (r.message) toast.success(r.message)
      onOk?.(r)
      router.refresh()
    })
  return { pending, error, setError, submit }
}

const ErrorNote = ({ error }: { error: string | null }) => (error ? <p role="alert" className="rounded-lg bg-rejected-soft px-3 py-2 text-sm text-rejected">{error}</p> : null)

const KIND = { GOODIE: "Goodie from stock", VOUCHER: "Voucher (Amazon or other)", OTHER: "Other (trophy, certificate…)" } as const
type Kind = keyof typeof KIND


// ---------------- add a winner ----------------

export function AwardDialog({ eventId, positions, items }: { eventId: string; positions: { name: string; bonusPoints: number }[]; items: { id: string; name: string; availableQty: number }[] }) {
  const first = positions[0]
  const blank = { empId: "", position: first?.name ?? "Winner", kind: "VOUCHER" as Kind, stockItemId: "", quantity: "1", voucherProvider: "Amazon", voucherAmount: "", description: "", bonusPoints: String(first?.bonusPoints ?? 0) }
  const [open, setOpen] = useState(false)
  const [v, setV] = useState(blank)
  const { pending, error, setError, submit } = useSubmit()
  const pick = (name: string) => setV({ ...v, position: name, bonusPoints: String(positions.find((p) => p.name === name)?.bonusPoints ?? v.bonusPoints) })
  const item = items.find((i) => i.id === v.stockItemId)
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setV(blank), setError(null)))}>
      <DialogTrigger asChild>
        <Button>
          <TrophyIcon data-icon="inline-start" />
          Add winner
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a winner</DialogTitle>
          <DialogDescription>Record who won and what they get. Someone not yet marked present is marked present too.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="aw-emp">Employee ID</FieldLabel>
            <Input id="aw-emp" spellCheck={false} value={v.empId} onChange={(e) => setV({ ...v, empId: e.target.value })} placeholder="e.g. 2000149999" />
          </Field>
          <Field>
            <FieldLabel htmlFor="aw-pos">Position</FieldLabel>
            <Select value={v.position} onValueChange={pick}>
              <SelectTrigger id="aw-pos" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{positions.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="aw-kind">Prize</FieldLabel>
            <Select value={v.kind} onValueChange={(k) => setV({ ...v, kind: k as Kind })}>
              <SelectTrigger id="aw-kind" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{(Object.keys(KIND) as Kind[]).map((k) => <SelectItem key={k} value={k}>{KIND[k]}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          {v.kind === "GOODIE" && (
            <>
              <Field>
                <FieldLabel htmlFor="aw-item">Goodie</FieldLabel>
                <Select value={v.stockItemId} onValueChange={(x) => setV({ ...v, stockItemId: x })}>
                  <SelectTrigger id="aw-item" className="w-full"><SelectValue placeholder="Choose an item" /></SelectTrigger>
                  <SelectContent><SelectGroup>{items.map((i) => <SelectItem key={i.id} value={i.id} disabled={i.availableQty <= 0}>{i.name} ({fmtNum(i.availableQty)})</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                {item && <FieldDescription>{fmtNum(item.availableQty)} in stock. It leaves the shelf when the distribution is approved.</FieldDescription>}
              </Field>
              <Field>
                <FieldLabel htmlFor="aw-qty">Quantity</FieldLabel>
                <Input id="aw-qty" inputMode="numeric" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value.replace(/[^0-9]/g, "") })} />
              </Field>
            </>
          )}
          {v.kind === "VOUCHER" && (
            <>
              <Field>
                <FieldLabel htmlFor="aw-prov">Voucher from</FieldLabel>
                <Input id="aw-prov" value={v.voucherProvider} onChange={(e) => setV({ ...v, voucherProvider: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="aw-amt">Amount (₹)</FieldLabel>
                <Input id="aw-amt" inputMode="numeric" value={v.voucherAmount} onChange={(e) => setV({ ...v, voucherAmount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="e.g. 5000" />
              </Field>
            </>
          )}
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="aw-desc">{v.kind === "OTHER" ? "What is the prize?" : "Note (optional)"}</FieldLabel>
            <Input id="aw-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder={v.kind === "OTHER" ? "e.g. Trophy and certificate" : "e.g. Best UI, team Phoenix"} />
          </Field>
          <Field>
            <FieldLabel htmlFor="aw-bonus">Bonus points</FieldLabel>
            <Input id="aw-bonus" inputMode="numeric" value={v.bonusPoints} onChange={(e) => setV({ ...v, bonusPoints: e.target.value.replace(/[^0-9]/g, "") })} />
            <FieldDescription>Default for {v.position}. Set 0 for none.</FieldDescription>
          </Field>
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              submit(
                () => addEventAward(eventId, { empId: v.empId, position: v.position, kind: v.kind, stockItemId: v.stockItemId || undefined, quantity: Number(v.quantity) || 1, voucherProvider: v.voucherProvider, voucherAmount: Number(v.voucherAmount) || 0, description: v.description, bonusPoints: Number(v.bonusPoints) || 0 }),
                (r) => {
                  const d = r.data as { name: string; markedPresent: boolean; milestones: number[] }
                  toast.success(`${v.position}: ${d.name}${d.markedPresent ? " (also marked present)" : ""}${d.milestones.length ? `, crossed ${d.milestones.map((m) => fmtNum(m)).join(", ")}` : ""}`)
                  setOpen(false)
                },
              )
            }
          >
            {pending && <Spinner data-icon="inline-start" />}
            Save winner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CancelAward({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setReason(""), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Cancel prize for ${label}`}>
          <XCircleIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this prize?</DialogTitle>
          <DialogDescription>{label}. Any bonus points it gave are taken back. Attendance stays.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="ca-reason">Reason</FieldLabel>
          <Input id="ca-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong person, results corrected" />
        </Field>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button variant="destructive" disabled={pending} onClick={() => submit(() => cancelEventAward(id, reason), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            Cancel prize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- prizes worklist ----------------

export type PrizeRow = { id: string; empId: string; name: string; department: string | null; position: string; kind: Kind; prize: string; event: string; eventId: string; date: string; bonus: number; stockOk: boolean }

export function PrizesWorklist({ rows, canOperate, mode }: { rows: PrizeRow[]; canOperate: boolean; mode: "goodies" | "vouchers" }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [refOpen, setRefOpen] = useState(false)
  const [ref, setRef] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  const router = useRouter()
  const all = rows.length > 0 && sel.size === rows.length
  const toggle = (id: string) => setSel((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))))
  const short = rows.filter((r) => sel.has(r.id) && !r.stockOk).length
  return (
    <div>
      {canOperate && (
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3 text-sm text-muted-foreground">
          {sel.size ? <span><span className="font-semibold text-foreground">{sel.size}</span> selected</span> : <span>{mode === "goodies" ? "Select goodie prizes to hand out together on one distribution." : "Select vouchers or other prizes you've sent, then mark them issued."}</span>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))}>{all ? "Clear selection" : `Select all ${rows.length}`}</Button>
        </div>
      )}
      {canOperate && sel.size > 0 && (
        <div role="region" aria-label="Selected prizes" className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[min(44rem,calc(100%-2rem))] flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 shadow-xl motion-safe:animate-in motion-safe:slide-in-from-bottom-4">
          <span className="text-sm"><span className="font-semibold">{sel.size}</span> prize{sel.size > 1 ? "s" : ""} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSel(new Set())}>Clear</Button>
            {mode === "goodies" ? (
              <Button size="sm" disabled={pending} onClick={() => submit(() => distributeEventAwards([...sel], true), (r) => { const d = r.data as { id: string; number: string }; toast.success(`${d.number} submitted for approval`); setSel(new Set()); router.push(`/requests/${d.id}`) })}>
                {pending ? <Spinner data-icon="inline-start" /> : <GiftIcon data-icon="inline-start" />}
                Create distribution and submit
              </Button>
            ) : (
              <Button size="sm" onClick={() => (setRef(""), setError(null), setRefOpen(true))}>
                <BadgeCheckIcon data-icon="inline-start" />
                Mark issued
              </Button>
            )}
          </div>
          {short > 0 && <p className="w-full text-xs text-pending">Not enough stock for {short} of these. Approval will be blocked until stock is received.</p>}
          {error && !refOpen && <p className="w-full text-xs text-rejected">{error}</p>}
        </div>
      )}
      <Dialog open={refOpen} onOpenChange={setRefOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {sel.size} prize{sel.size > 1 ? "s" : ""} as issued</DialogTitle>
            <DialogDescription>Record the voucher order or reference number so finance can match it. Don&apos;t type the voucher code itself.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="iss-ref">Order or reference number</FieldLabel>
            <Input id="iss-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. Amazon order 403-1234567-1234567" />
          </Field>
          <ErrorNote error={error} />
          <DialogFooter>
            <Button disabled={pending} onClick={() => submit(() => issueEventAwards([...sel], ref), (r) => { toast.success(`${(r.data as { count: number }).count} marked issued`); setSel(new Set()); setRefOpen(false) })}>
              {pending && <Spinner data-icon="inline-start" />}
              Mark issued
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canOperate && <TableHead className="w-10 pl-5"><Checkbox aria-label="Select all" checked={all ? true : sel.size ? "indeterminate" : false} onCheckedChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} /></TableHead>}
            <TableHead className={cn(!canOperate && "pl-5")}>Employee</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Prize</TableHead>
            <TableHead className="hidden md:table-cell">Event</TableHead>
            <TableHead className="hidden pr-5 text-right lg:table-cell">Bonus</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-state={sel.has(r.id) ? "selected" : undefined}>
              {canOperate && <TableCell className="pl-5"><Checkbox aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} /></TableCell>}
              <TableCell className={cn(!canOperate && "pl-5")}>
                <div className="flex flex-col">
                  <span className="font-medium">{r.name}</span>
                  <span className="num text-xs text-muted-foreground">{r.empId}{r.department ? `, ${r.department}` : ""}</span>
                </div>
              </TableCell>
              <TableCell><span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap", POSITION_TONE(r.position))}>{r.position}</span></TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-sm">
                  {r.kind === "VOUCHER" ? <TicketIcon className="size-4 text-muted-foreground" /> : r.kind === "GOODIE" ? <GiftIcon className="size-4 text-muted-foreground" /> : <TrophyIcon className="size-4 text-muted-foreground" />}
                  {r.prize}
                </span>
                {!r.stockOk && <span className="block text-xs text-pending">Not enough stock</span>}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Link href={`/events/${r.eventId}`} className="flex flex-col hover:text-primary">
                  <span className="truncate">{r.event}</span>
                  <span className="num text-xs text-muted-foreground">{fmtDate(r.date)}</span>
                </Link>
              </TableCell>
              <TableCell className="num hidden pr-5 text-right lg:table-cell">{r.bonus ? `+${fmtNum(r.bonus)}` : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------- events from Excel ----------------

export function EventsUpload() {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<EventUploadResult | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setResult(null), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UploadIcon data-icon="inline-start" />
          Upload events
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload events from Excel</DialogTitle>
          <DialogDescription>One row per event: Event name, Event type, Date, and optionally Location, Organiser, Points and Description. Future dates appear under Upcoming.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={file}
            type="file"
            accept=".xlsx"
            className="sr-only"
            aria-label="Events sheet"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const fd = new FormData()
              fd.set("file", f)
              submit(() => uploadEvents(fd), (r) => setResult(r.data as EventUploadResult))
              e.target.value = ""
            }}
          />
          <Button disabled={pending} onClick={() => file.current?.click()}>
            {pending ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            Choose the Excel file
          </Button>
          <Button variant="ghost" asChild>
            <a href={`/api/templates/events`}>
              <DownloadIcon data-icon="inline-start" />
              Template
            </a>
          </Button>
        </div>
        <ErrorNote error={error} />
        {result && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <p>
              <span className="font-semibold">{fmtNum(result.created)} event{result.created === 1 ? "" : "s"} created</span> from {fmtNum(result.rows)} rows
              {result.upcoming > 0 && <>, {fmtNum(result.upcoming)} upcoming</>}.
              {result.duplicates > 0 && <> {fmtNum(result.duplicates)} were already there (same name and date) and were skipped.</>}
            </p>
            {result.errors.length > 0 && (
              <div className="text-rejected">
                <p className="font-medium">{result.errors.length} row{result.errors.length > 1 ? "s" : ""} not added:</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.errors.slice(0, 12).map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
                </ul>
                {result.errors.length > 12 && <p>…and {result.errors.length - 12} more.</p>}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- admin: positions ----------------

export function PositionDialog({ position }: { position?: { id: string; name: string; bonusPoints: number; active: boolean } }) {
  const blank = { name: "", bonusPoints: "100", active: true }
  const init = position ? { name: position.name, bonusPoints: String(position.bonusPoints), active: position.active } : blank
  const [open, setOpen] = useState(false)
  const [v, setV] = useState(init)
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setV(init), setError(null)))}>
      <DialogTrigger asChild>
        {position ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${position.name}`}><PencilIcon /></Button>
        ) : (
          <Button variant="outline" size="sm"><PlusCircleIcon data-icon="inline-start" />Add position</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{position ? `Edit ${position.name}` : "Add a position"}</DialogTitle>
          <DialogDescription>Bonus points are the default when an executive records this place; they can change it per prize.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="po-name">Name</FieldLabel>
            <Input id="po-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Best design" />
          </Field>
          <Field>
            <FieldLabel htmlFor="po-pts">Bonus points</FieldLabel>
            <Input id="po-pts" inputMode="numeric" value={v.bonusPoints} onChange={(e) => setV({ ...v, bonusPoints: e.target.value.replace(/[^0-9]/g, "") })} />
          </Field>
          <Field orientation="horizontal" className="sm:col-span-2">
            <Switch id="po-active" checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c })} />
            <FieldLabel htmlFor="po-active">Available for new prizes</FieldLabel>
          </Field>
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button disabled={pending} onClick={() => submit(() => saveAwardPosition(position?.id ?? null, v), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
