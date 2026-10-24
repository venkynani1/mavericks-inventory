"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { createReceipt } from "@/app/actions/requests"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ItemPicker, type PickItem } from "./item-picker"

type Line = { key: number; stockItemId: string; quantity: string; remarks: string }
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
let k = 0

export function ReceiptForm({ items, defaultItem }: { items: PickItem[]; defaultItem?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [reference, setReference] = useState("")
  const [date, setDate] = useState(today())
  const [lines, setLines] = useState<Line[]>([{ key: k++, stockItemId: defaultItem ?? "", quantity: "", remarks: "" }])
  // Receiving stock is allowed for items at zero, so lift the availability guard in the picker.
  const pickItems = items.map((i) => ({ ...i, available: Math.max(i.available, 1) }))
  const update = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))

  const save = (submit: boolean) => {
    setError(null)
    start(async () => {
      const res = await createReceipt({ title, purpose: reference, submit, lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, receivedOn: date, remarks: l.remarks })) })
      if (!res.ok) return setError(res.error)
      toast.success(`${res.message} — ${res.data?.number}`)
      router.push(`/requests/${res.data?.id}`)
    })
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); save(true) }}>
      <section className="rounded-xl border bg-card p-6">
        <FieldSet>
          <FieldLegend>Delivery details</FieldLegend>
          <FieldGroup className="grid gap-5 md:grid-cols-3">
            <Field className="md:col-span-3">
              <FieldLabel htmlFor="title">Request title</FieldLabel>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Crocodile T-shirt replenishment" />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="ref">PO, invoice or vendor reference</FieldLabel>
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO 4512 — Crocodile" />
            </Field>
            <Field>
              <FieldLabel htmlFor="date">Received on</FieldLabel>
              <Input id="date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </FieldGroup>
        </FieldSet>
      </section>
      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-[15px] font-semibold">Items received</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: k++, stockItemId: "", quantity: "", remarks: "" }])}>
            <PlusIcon data-icon="inline-start" />
            Add line
          </Button>
        </div>
        <ul className="flex flex-col">
          {lines.map((l, idx) => (
            <li key={l.key} className="grid gap-3 px-5 py-2 md:grid-cols-[minmax(0,2fr)_110px_minmax(0,1.2fr)_40px]">
              <ItemPicker items={pickItems} value={l.stockItemId} onChange={(id) => update(l.key, { stockItemId: id })} />
              <Input aria-label={`Quantity received, line ${idx + 1}`} placeholder="Qty" type="number" min={1} className="num h-9" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              <Input aria-label={`Remarks, line ${idx + 1}`} placeholder="Remarks (carton numbers…)" className="h-9" value={l.remarks} onChange={(e) => update(l.key, { remarks: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${idx + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      </section>
      {error && <p role="alert" className="rounded-lg bg-rejected-soft px-4 py-3 text-sm text-rejected">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Submit for approval
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
          Save draft
        </Button>
        <span className="text-sm text-muted-foreground">Quantities are added to stock after final approval.</span>
      </div>
    </form>
  )
}
