"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { createDistribution } from "@/app/actions/requests"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn, count } from "@/lib/utils"
import { ItemPicker, type PickItem } from "./item-picker"
import { useUnsavedGuard } from "./use-unsaved-guard"

type Line = { key: number; stockItemId: string; quantity: string; recipientId: string; recipientName: string }

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
let k = 0

export function DistributionForm({ items, purposes, locations, defaultItem, me }: { items: PickItem[]; purposes: string[]; locations: string[]; defaultItem?: string; me: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [purpose, setPurpose] = useState(purposes[0] ?? "")
  const [date, setDate] = useState(today())
  const [location, setLocation] = useState(locations[0] ?? "")
  const [poc, setPoc] = useState(me)
  const [remarks, setRemarks] = useState("")
  const [lines, setLines] = useState<Line[]>([{ key: k++, stockItemId: defaultItem ?? "", quantity: "1", recipientId: "", recipientName: "" }])
  const [tried, setTried] = useState(false)
  const [saved, setSaved] = useState(false)
  useUnsavedGuard(!saved && (title.trim() !== "" || lines.some((l) => l.recipientName || l.recipientId)))

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  // Live availability: total requested per item against what's on the shelf now.
  const demand = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lines) if (l.stockItemId) m.set(l.stockItemId, (m.get(l.stockItemId) ?? 0) + (Number(l.quantity) || 0))
    return m
  }, [lines])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const over = [...demand.entries()].filter(([id, q]) => q > (byId.get(id)?.available ?? 0))
  const totalUnits = [...demand.values()].reduce((a, b) => a + b, 0)

  const save = (submit: boolean) => {
    setTried(true)
    setError(null)
    start(async () => {
      const res = await createDistribution({
        title,
        purpose,
        remarks,
        submit,
        lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, distributedOn: date, recipientId: l.recipientId, recipientName: l.recipientName, location, purpose, poc })),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSaved(true)
      toast.success(`${res.message}: ${res.data?.number}`)
      router.push(`/requests/${res.data?.id}`)
    })
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        save(true)
      }}
    >
      <section className="rounded-xl border bg-card p-6">
        <FieldSet>
          <FieldLegend>Handover details</FieldLegend>
          <FieldDescription>These apply to every line below.</FieldDescription>
          <FieldGroup className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field className="md:col-span-2 xl:col-span-3" data-invalid={(tried && title.trim().length < 3) || undefined}>
              <FieldLabel htmlFor="title">Request title</FieldLabel>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Onboarding batch 21 welcome kits…" aria-invalid={(tried && title.trim().length < 3) || undefined} />
            </Field>
            <Field>
              <FieldLabel htmlFor="purpose">Purpose</FieldLabel>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger id="purpose" className="w-full">
                  <SelectValue placeholder="Choose a purpose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {purposes.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="date">Distribution date</FieldLabel>
              <Input id="date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="location">Location</FieldLabel>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger id="location" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {locations.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="poc">Handed over by (POC)</FieldLabel>
              <Input id="poc" value={poc} onChange={(e) => setPoc(e.target.value)} />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="remarks">Remarks for the approver</FieldLabel>
              <Textarea id="remarks" rows={1} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional. For example, the event mail subject…" />
            </Field>
          </FieldGroup>
        </FieldSet>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Items and recipients</h2>
            <p className="num text-sm text-muted-foreground">
              {count(lines.length, "line")}, {count(totalUnits, "unit")}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: k++, stockItemId: ls.at(-1)?.stockItemId ?? "", quantity: "1", recipientId: "", recipientName: "" }])}>
            <PlusIcon data-icon="inline-start" />
            Add line
          </Button>
        </div>
        <div className="hidden grid-cols-[minmax(0,2.2fr)_90px_minmax(0,1fr)_minmax(0,1.4fr)_40px] gap-3 px-5 pt-3 text-xs font-medium text-muted-foreground md:grid">
          <span>Item</span>
          <span>Qty</span>
          <span>Emp ID</span>
          <span>Recipient name</span>
          <span className="sr-only">Remove</span>
        </div>
        <ul className="flex flex-col divide-y md:divide-y-0">
          {lines.map((l, idx) => {
            const it = byId.get(l.stockItemId)
            const short = it && (demand.get(it.id) ?? 0) > it.available
            return (
              <li key={l.key} className="grid gap-3 px-5 py-3 md:grid-cols-[minmax(0,2.2fr)_90px_minmax(0,1fr)_minmax(0,1.4fr)_40px] md:items-start md:py-2">
                <div className="flex flex-col gap-1">
                  <ItemPicker items={items} value={l.stockItemId} onChange={(id) => update(l.key, { stockItemId: id })} invalid={(tried && !l.stockItemId) || !!short} />
                  {it && <span className={cn("num text-xs", short ? "text-rejected" : "text-muted-foreground")}>{short ? `Only ${it.available} available for all lines combined` : `${it.available} available`}</span>}
                </div>
                <Input aria-label={`Quantity, line ${idx + 1}`} type="number" min={1} step={1} inputMode="numeric" className="num h-9" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                <Input aria-label={`Employee ID, line ${idx + 1}`} placeholder="Emp ID" className="h-9" spellCheck={false} autoComplete="off" value={l.recipientId} onChange={(e) => update(l.key, { recipientId: e.target.value })} />
                <Input aria-label={`Recipient name, line ${idx + 1}`} placeholder="Recipient name" className="h-9" value={l.recipientName} aria-invalid={(tried && l.recipientName.trim().length < 2) || undefined} onChange={(e) => update(l.key, { recipientName: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${idx + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2Icon />
                </Button>
              </li>
            )
          })}
        </ul>
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">Recording more than a few dozen people? Use Upload Excel instead. It accepts your existing recipient sheet.</p>
      </section>

      {over.length > 0 && (
        <p className="rounded-lg bg-pending-soft px-4 py-3 text-sm text-pending">
          {over.length} item{over.length > 1 ? "s are" : " is"} over the available quantity. You can save a draft, but it can&apos;t be submitted until the quantities fit.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-rejected-soft px-4 py-3 text-sm text-rejected">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || over.length > 0}>
          {pending && <Spinner data-icon="inline-start" />}
          Submit for approval
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
          Save draft
        </Button>
        <span className="text-sm text-muted-foreground">Stock is deducted only after final approval.</span>
      </div>
    </form>
  )
}
