"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { CalendarPlusIcon, DownloadIcon, GiftIcon, MinusCircleIcon, PencilIcon, PlusCircleIcon, RotateCcwIcon, UploadIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import {
  addAttendees,
  adjustEmployeePoints,
  createEvent,
  distributeRewards,
  removeAttendee,
  resetAllPoints,
  resetEmployeePoints,
  saveEmployee,
  saveEventType,
  saveMilestone,
  saveRewardRules,
  updateEvent,
  uploadAttendance,
  type EmployeeInput,
  type EventInput,
  type EventTypeInput,
} from "@/app/actions/rewards"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn, fmtDate, fmtNum } from "@/lib/utils"
import { CATEGORY_LABEL } from "./rewards-display"

type Res<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string }

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return <p role="alert" className="rounded-lg bg-rejected-soft px-3 py-2 text-sm text-rejected">{error}</p>
}

/** Runs a server action, shows the outcome and refreshes the page data. */
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

const Opt = ({ value, onChange, options, id, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id?: string; placeholder?: string }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger id={id} className="w-full">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
)

// ---------------- events ----------------

type EventType = { id: string; name: string; category: string; points: number }

export function EventDialog({ event, types, locked }: { event?: EventInput & { id: string }; types: EventType[]; locked?: boolean }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()) // yyyy-mm-dd in IST
  const blank: EventInput = { name: "", eventTypeId: types[0]?.id ?? "", date: today, location: "Chennai", organizer: "", description: "", points: "" }
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<EventInput>(event ?? blank)
  const { pending, error, setError, submit } = useSubmit()
  const router = useRouter()
  const type = types.find((t) => t.id === v.eventTypeId)
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setV(event ?? blank), setError(null)))}>
      <DialogTrigger asChild>
        {event ? (
          <Button variant="outline">
            <PencilIcon data-icon="inline-start" />
            Edit event
          </Button>
        ) : (
          <Button>
            <CalendarPlusIcon data-icon="inline-start" />
            New event
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>The event type sets the points each attendee gets. You can override it for a flagship event.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ev-name">Event name</FieldLabel>
            <Input id="ev-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. GenAI Tech Talk: RAG in practice" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ev-type">Type</FieldLabel>
            <Select value={v.eventTypeId} onValueChange={(x) => setV({ ...v, eventTypeId: x })} disabled={locked}>
              <SelectTrigger id="ev-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({fmtNum(t.points)} pts)
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {type && <FieldDescription>{CATEGORY_LABEL[type.category]}</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor="ev-date">Date</FieldLabel>
            <Input id="ev-date" type="date" value={String(v.date).slice(0, 10)} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ev-loc">Location</FieldLabel>
            <Input id="ev-loc" value={v.location ?? ""} onChange={(e) => setV({ ...v, location: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ev-org">Organiser</FieldLabel>
            <Input id="ev-org" value={v.organizer ?? ""} onChange={(e) => setV({ ...v, organizer: e.target.value })} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ev-pts">Points per attendee (optional override)</FieldLabel>
            <Input id="ev-pts" inputMode="numeric" disabled={locked} value={String(v.points ?? "")} onChange={(e) => setV({ ...v, points: e.target.value.replace(/[^0-9]/g, "") })} placeholder={type ? `${type.points} from the event type` : ""} />
            <FieldDescription>{locked ? "Attendance is recorded, so points are locked." : "Leave empty to use the event type's points."}</FieldDescription>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ev-desc">Notes</FieldLabel>
            <Textarea id="ev-desc" rows={2} value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              submit(
                (): Promise<Res<unknown>> => (event ? updateEvent(event.id, v) : createEvent(v)),
                (r) => {
                  setOpen(false)
                  const id = (r.data as { id?: string } | undefined)?.id
                  if (!event && id) router.push(`/events/${id}`)
                },
              )
            }
          >
            {pending && <Spinner data-icon="inline-start" />}
            {event ? "Save event" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type AttResult = { added: number; alreadyPresent: number; unknown: string[]; created: number; capped: number; milestones: { empId: string; name: string; thresholds: number[] }[]; points: number; rows?: number }

function AttendanceSummary({ r }: { r: AttResult }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <p>
        <span className="font-semibold">{fmtNum(r.added)} marked present</span>, +{fmtNum(r.points)} points each.
        {r.alreadyPresent > 0 && <> {fmtNum(r.alreadyPresent)} were already marked and were skipped.</>}
        {r.created > 0 && <> {fmtNum(r.created)} new employee records were created from the sheet.</>}
        {r.capped > 0 && <> {fmtNum(r.capped)} reached the points cap.</>}
      </p>
      {r.milestones.length > 0 && (
        <p className="flex items-start gap-2 text-reward">
          <GiftIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            {r.milestones.length} crossed a milestone: {r.milestones.slice(0, 6).map((m) => `${m.name} (${m.thresholds.map((t) => fmtNum(t)).join(", ")})`).join("; ")}
            {r.milestones.length > 6 && ` and ${r.milestones.length - 6} more`}. They&apos;re now in <Link href="/rewards" className="underline">Rewards</Link>.
          </span>
        </p>
      )}
      {r.unknown.length > 0 && (
        <p className="text-rejected">
          Not found ({r.unknown.length}): {r.unknown.slice(0, 15).join(", ")}
          {r.unknown.length > 15 && "…"}. Add them under Employees, or upload a sheet with their names.
        </p>
      )}
    </div>
  )
}

export function AttendeesAdder({ eventId, disabled }: { eventId: string; disabled?: boolean }) {
  const [text, setText] = useState("")
  const [result, setResult] = useState<AttResult | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const { pending, error, submit } = useSubmit()
  const n = new Set(text.split(/[\s,;]+/).filter(Boolean)).size
  if (disabled) return <p className="px-5 py-4 text-sm text-muted-foreground">This event is cancelled, so attendance can&apos;t be recorded.</p>
  return (
    <div className="flex flex-col gap-4 p-5">
      <Field>
        <FieldLabel htmlFor="att-ids">Employee IDs</FieldLabel>
        <Textarea id="att-ids" rows={4} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Paste IDs separated by commas, spaces or new lines.\n2000100001, 2000100002"} className="font-mono text-sm" />
        <FieldDescription>People already marked present are skipped, so it&apos;s safe to paste the same list twice.</FieldDescription>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending || !n} onClick={() => submit(() => addAttendees(eventId, text), (r) => (setResult(r.data as AttResult), setText("")))}>
          {pending ? <Spinner data-icon="inline-start" /> : <UserPlusIcon data-icon="inline-start" />}
          {n ? `Mark ${fmtNum(n)} present` : "Mark present"}
        </Button>
        <span className="text-sm text-muted-foreground">or</span>
        <input
          ref={file}
          type="file"
          accept=".xlsx"
          className="sr-only"
          aria-label="Attendance sheet"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const fd = new FormData()
            fd.set("file", f)
            submit(() => uploadAttendance(eventId, fd), (r) => setResult(r.data as AttResult))
            e.target.value = ""
          }}
        />
        <Button variant="outline" disabled={pending} onClick={() => file.current?.click()}>
          <UploadIcon data-icon="inline-start" />
          Upload attendance sheet
        </Button>
        <Button variant="ghost" asChild>
          <a href={`/api/templates/attendance`}>
            <DownloadIcon data-icon="inline-start" />
            Template
          </a>
        </Button>
      </div>
      <ErrorNote error={error} />
      {result && <AttendanceSummary r={result} />}
    </div>
  )
}

export function RemoveAttendee({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setReason(""), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`}>
          <MinusCircleIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name} from this event?</DialogTitle>
          <DialogDescription>The points they got for it are taken back. A reward not yet handed out is cancelled if they drop below its milestone.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="rm-reason">Reason</FieldLabel>
          <Input id="rm-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Marked by mistake, didn't attend" />
        </Field>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button variant="destructive" disabled={pending} onClick={() => submit(() => removeAttendee(id, reason), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            Remove and reverse points
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- employees ----------------

export function EmployeeDialog({ employee }: { employee?: EmployeeInput & { id: string } }) {
  const blank: EmployeeInput = { empId: "", name: "", email: "", department: "", designation: "", location: "Chennai", active: true }
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<EmployeeInput>(employee ?? blank)
  const { pending, error, setError, submit } = useSubmit()
  const set = (k: keyof EmployeeInput) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setV(employee ?? blank), setError(null)))}>
      <DialogTrigger asChild>
        {employee ? (
          <Button variant="outline">
            <PencilIcon data-icon="inline-start" />
            Edit details
          </Button>
        ) : (
          <Button>
            <UserPlusIcon data-icon="inline-start" />
            Add employee
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee ? `Edit ${employee.name}` : "Add an employee"}</DialogTitle>
          <DialogDescription>Employees are also created automatically when an attendance sheet includes their name.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="e-id">Employee ID</FieldLabel>
            <Input id="e-id" spellCheck={false} value={v.empId} onChange={set("empId")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="e-name">Full name</FieldLabel>
            <Input id="e-name" value={v.name} onChange={set("name")} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="e-email">Work email</FieldLabel>
            <Input id="e-email" type="email" spellCheck={false} value={v.email ?? ""} onChange={set("email")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="e-dept">Department</FieldLabel>
            <Input id="e-dept" value={v.department ?? ""} onChange={set("department")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="e-desig">Designation</FieldLabel>
            <Input id="e-desig" value={v.designation ?? ""} onChange={set("designation")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="e-loc">Location</FieldLabel>
            <Input id="e-loc" value={v.location ?? ""} onChange={set("location")} />
          </Field>
          {employee && (
            <Field orientation="horizontal" className="self-end">
              <Switch id="e-active" checked={!!v.active} onCheckedChange={(c) => setV({ ...v, active: c })} />
              <FieldLabel htmlFor="e-active">Active (earns points)</FieldLabel>
            </Field>
          )}
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button disabled={pending} onClick={() => submit(() => saveEmployee(employee?.id ?? null, v), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            {employee ? "Save" : "Add employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AdjustPointsDialog({ employeeId, name, points, cap }: { employeeId: string; name: string; points: number; cap: number }) {
  const [open, setOpen] = useState(false)
  const [dir, setDir] = useState<"add" | "remove">("add")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  const delta = (dir === "add" ? 1 : -1) * (Number(amount) || 0)
  const after = Math.max(0, Math.min(cap, points + delta))
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setAmount(""), setReason(""), setDir("add"), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusCircleIcon data-icon="inline-start" />
          Adjust points
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust {name}&apos;s points</DialogTitle>
          <DialogDescription>For corrections and special recognition. The reason is kept in their points history and the audit log.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="adj-dir">Change</FieldLabel>
            <Opt id="adj-dir" value={dir} onChange={(x) => setDir(x as "add")} options={[{ value: "add", label: "Add points" }, { value: "remove", label: "Remove points" }]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="adj-amt">Points</FieldLabel>
            <Input id="adj-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="adj-reason">Reason</FieldLabel>
            <Input id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Volunteer lead for Mavericks Week" />
          </Field>
        </FieldGroup>
        <p className="num rounded-lg bg-muted px-3 py-2 text-sm">
          {fmtNum(points)} → <span className="font-semibold">{fmtNum(after)}</span> points
          {points + delta > cap && <span className="text-pending"> (limited by the {fmtNum(cap)} cap)</span>}
        </p>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button disabled={pending || !delta} onClick={() => submit(() => adjustEmployeePoints(employeeId, delta, reason), () => (toast.success("Points updated"), setOpen(false)))}>
            {pending && <Spinner data-icon="inline-start" />}
            Save adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ResetPointsDialog({ employeeId, name, points }: { employeeId: string; name: string; points: number }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setReason(""), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={points === 0}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset points
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset {name} to zero?</DialogTitle>
          <DialogDescription>
            Their {fmtNum(points)} points go back to 0 and a new cycle starts, so they can earn every milestone again. Rewards already earned stay as they are.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="rs-reason">Reason</FieldLabel>
          <Input id="rs-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Reached the cap, new cycle for FY 2027" />
        </Field>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button variant="destructive" disabled={pending} onClick={() => submit(() => resetEmployeePoints(employeeId, reason), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            Reset to zero
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- rewards worklist ----------------

export type DueRow = { id: string; empId: string; name: string; department: string | null; location: string | null; threshold: number; title: string; earnedAt: string; goodieId: string | null; goodie: string | null; goodieQty: number | null }

export function RewardsWorklist({ rows, items, canOperate }: { rows: DueRow[]; items: { id: string; name: string; availableQty: number }[]; canOperate: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [over, setOver] = useState<Record<string, string>>({})
  const { pending, error, submit } = useSubmit()
  const router = useRouter()
  const all = rows.length > 0 && sel.size === rows.length
  const toggle = (id: string) => setSel((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))))
  const missing = rows.filter((r) => sel.has(r.id) && !r.goodieId && !over[r.id])
  const need = new Map<string, number>()
  for (const r of rows) if (sel.has(r.id)) { const g = over[r.id] || r.goodieId; if (g) need.set(g, (need.get(g) ?? 0) + 1) }
  const short = [...need].filter(([g, n]) => (items.find((i) => i.id === g)?.availableQty ?? 0) < n)
  const go = (submitNow: boolean) =>
    submit(
      () => distributeRewards([...sel], { submit: submitNow, itemOverrides: Object.fromEntries(Object.entries(over).filter(([k]) => sel.has(k))) }),
      (r) => {
        const d = r.data as { id: string; number: string }
        toast.success(`${d.number} ${submitNow ? "submitted for approval" : "saved as a draft"}`)
        setSel(new Set())
        router.push(`/requests/${d.id}`)
      },
    )
  return (
    <div>
      {canOperate && (
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3 text-sm text-muted-foreground">
          {sel.size ? <span><span className="font-semibold text-foreground">{sel.size}</span> selected</span> : <span>Select people to hand out their goodies together on one distribution.</span>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))}>{all ? "Clear selection" : `Select all ${rows.length}`}</Button>
        </div>
      )}
      {canOperate && sel.size > 0 && (
        <div role="region" aria-label="Selected rewards" className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[min(44rem,calc(100%-2rem))] flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 shadow-xl motion-safe:animate-in motion-safe:slide-in-from-bottom-4">
          <span className="text-sm"><span className="font-semibold">{sel.size}</span> reward{sel.size > 1 ? "s" : ""} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSel(new Set())}>Clear</Button>
            <Button variant="outline" size="sm" disabled={pending || missing.length > 0} onClick={() => go(false)}>Save as draft</Button>
            <Button size="sm" disabled={pending || missing.length > 0} onClick={() => go(true)}>
              {pending ? <Spinner data-icon="inline-start" /> : <GiftIcon data-icon="inline-start" />}
              Create distribution and submit
            </Button>
          </div>
          {missing.length > 0 && <p className="w-full text-xs text-rejected">Choose a goodie for {missing.length} selected reward{missing.length > 1 ? "s" : ""} (their milestone has no goodie set).</p>}
          {short.length > 0 && <p className="w-full text-xs text-pending">Not enough stock for {short.map(([g]) => items.find((i) => i.id === g)?.name).join(", ")}. Approval will be blocked until stock is received.</p>}
          {error && <p className="w-full text-xs text-rejected">{error}</p>}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canOperate && (
              <TableHead className="w-10 pl-5">
                <Checkbox aria-label="Select all" checked={all ? true : sel.size ? "indeterminate" : false} onCheckedChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} />
              </TableHead>
            )}
            <TableHead className={cn(!canOperate && "pl-5")}>Employee</TableHead>
            <TableHead>Milestone</TableHead>
            <TableHead className="hidden md:table-cell">Earned</TableHead>
            <TableHead className="pr-5">Goodie</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-state={sel.has(r.id) ? "selected" : undefined}>
              {canOperate && (
                <TableCell className="pl-5">
                  <Checkbox aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                </TableCell>
              )}
              <TableCell className={cn(!canOperate && "pl-5")}>
                <div className="flex flex-col">
                  <span className="font-medium">{r.name}</span>
                  <span className="num text-xs text-muted-foreground">
                    {r.empId}
                    {r.department ? `, ${r.department}` : ""}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="num font-medium">{fmtNum(r.threshold)}</span>
                  <span className="text-xs text-muted-foreground">{r.title}</span>
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{fmtDate(r.earnedAt)}</TableCell>
              <TableCell className="pr-5">
                {r.goodieId && !over[r.id] ? (
                  <span className="text-sm">{r.goodie}{r.goodieQty && r.goodieQty > 1 ? ` x${r.goodieQty}` : ""}</span>
                ) : canOperate ? (
                  <Select value={over[r.id] ?? ""} onValueChange={(x) => setOver({ ...over, [r.id]: x })}>
                    <SelectTrigger size="sm" className="w-56 max-w-full" aria-label={`Goodie for ${r.name}`}>
                      <SelectValue placeholder="Choose a goodie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {items.map((i) => (
                          <SelectItem key={i.id} value={i.id} disabled={i.availableQty <= 0}>
                            {i.name} ({fmtNum(i.availableQty)})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">To be decided</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------- admin rules ----------------

export function EventTypeDialog({ type }: { type?: EventTypeInput & { id: string } }) {
  const blank: EventTypeInput = { name: "", category: "TECH", points: 200, description: "", active: true }
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<EventTypeInput>(type ?? blank)
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setV(type ?? blank), setError(null)))}>
      <DialogTrigger asChild>
        {type ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${type.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusCircleIcon data-icon="inline-start" />
            Add event type
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type ? `Edit ${type.name}` : "Add an event type"}</DialogTitle>
          <DialogDescription>Changing points affects attendance recorded from now on. Points already credited don&apos;t change.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="et-name">Name</FieldLabel>
            <Input id="et-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="et-cat">Category</FieldLabel>
            <Opt id="et-cat" value={String(v.category)} onChange={(x) => setV({ ...v, category: x as EventTypeInput["category"] })} options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="et-pts">Points per attendee</FieldLabel>
            <Input id="et-pts" inputMode="numeric" value={String(v.points)} onChange={(e) => setV({ ...v, points: e.target.value.replace(/[^0-9]/g, "") })} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="et-desc">Description</FieldLabel>
            <Input id="et-desc" value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <Field orientation="horizontal">
            <Switch id="et-active" checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c })} />
            <FieldLabel htmlFor="et-active">Available for new events</FieldLabel>
          </Field>
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button disabled={pending} onClick={() => submit(() => saveEventType(type?.id ?? null, v), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MilestoneDialog({ m, items }: { m: { id: string; threshold: number; title: string; description: string | null; stockItemId: string | null; quantity: number }; items: { id: string; name: string; availableQty: number }[] }) {
  const [open, setOpen] = useState(false)
  const init = { title: m.title, description: m.description ?? "", stockItemId: m.stockItemId ?? "none", quantity: String(m.quantity) }
  const [v, setV] = useState(init)
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setV(init), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit the ${m.threshold} milestone`}>
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fmtNum(m.threshold)}-point milestone</DialogTitle>
          <DialogDescription>Choose the goodie people get when they reach this milestone. You can leave it to be decided and pick per person when handing out.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ms-title">Title</FieldLabel>
            <Input id="ms-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ms-item">Goodie</FieldLabel>
            <Opt id="ms-item" value={v.stockItemId} onChange={(x) => setV({ ...v, stockItemId: x })} options={[{ value: "none", label: "To be decided" }, ...items.map((i) => ({ value: i.id, label: `${i.name} (${fmtNum(i.availableQty)} in stock)` }))]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ms-qty">Quantity</FieldLabel>
            <Input id="ms-qty" inputMode="numeric" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value.replace(/[^0-9]/g, "") })} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ms-desc">Note for employees (optional)</FieldLabel>
            <Input id="ms-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button disabled={pending} onClick={() => submit(() => saveMilestone(m.id, { ...v, stockItemId: v.stockItemId === "none" ? "" : v.stockItemId }), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            Save milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RewardRulesForm({ step, cap, leaderboard }: { step: number; cap: number; leaderboard: boolean }) {
  const [v, setV] = useState({ step: String(step), cap: String(cap), leaderboardForEmployees: leaderboard })
  const { pending, error, submit } = useSubmit()
  const n = Number(v.step) > 0 ? Math.floor(Number(v.cap) / Number(v.step)) : 0
  return (
    <div className="flex flex-col gap-4 p-5">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="rr-step">A goodie every</FieldLabel>
          <Input id="rr-step" inputMode="numeric" value={v.step} onChange={(e) => setV({ ...v, step: e.target.value.replace(/[^0-9]/g, "") })} />
          <FieldDescription>points</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="rr-cap">Maximum points</FieldLabel>
          <Input id="rr-cap" inputMode="numeric" value={v.cap} onChange={(e) => setV({ ...v, cap: e.target.value.replace(/[^0-9]/g, "") })} />
          <FieldDescription>{n > 0 ? `${n} milestones` : "Must be a multiple of the step"}</FieldDescription>
        </Field>
        <Field orientation="horizontal" className="sm:col-span-2">
          <Switch id="rr-lb" checked={v.leaderboardForEmployees} onCheckedChange={(c) => setV({ ...v, leaderboardForEmployees: c })} />
          <FieldLabel htmlFor="rr-lb">Show the top-10 leaderboard to employees in their portal</FieldLabel>
        </Field>
      </FieldGroup>
      <ErrorNote error={error} />
      <div>
        <Button disabled={pending} onClick={() => submit(() => saveRewardRules(v))}>
          {pending && <Spinner data-icon="inline-start" />}
          Save rules
        </Button>
      </div>
    </div>
  )
}

export function ResetAllDialog({ count }: { count: number }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [confirm, setConfirm] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setReason(""), setConfirm(""), setError(null)))}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-rejected/40 text-rejected hover:bg-rejected-soft">
          <UsersIcon data-icon="inline-start" />
          Reset everyone&apos;s points
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset points for {fmtNum(count)} employees?</DialogTitle>
          <DialogDescription>Everyone goes back to 0 and starts a new cycle. Rewards already earned are kept. This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ra-reason">Reason</FieldLabel>
            <Input id="ra-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. New programme year FY 2027" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ra-confirm">Type RESET to confirm</FieldLabel>
            <Input id="ra-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button variant="destructive" disabled={pending || confirm !== "RESET"} onClick={() => submit(() => resetAllPoints(reason, confirm), (r) => (toast.success(`Reset ${(r.data as { count: number }).count} employees`), setOpen(false)))}>
            {pending && <Spinner data-icon="inline-start" />}
            Reset everyone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
