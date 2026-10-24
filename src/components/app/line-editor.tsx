"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { removeLines, saveDistributionLine, saveReceiptLine } from "@/app/actions/requests"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ItemPicker, type PickItem } from "./item-picker"
import { ConfirmAction } from "./confirm-action"

export type DistLineValue = { stockItemId: string; quantity: string; distributedOn: string; recipientId: string; recipientName: string; location: string; purpose: string; poc: string; remarks: string }
export type ReceiptLineValue = { stockItemId: string; quantity: string; receivedOn: string; remarks: string }

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

export function DistLineDialog({ requestId, lineId, initial, items, defaults }: { requestId: string; lineId?: string; initial?: DistLineValue; items: PickItem[]; defaults?: Partial<DistLineValue> }) {
  const empty: DistLineValue = { stockItemId: "", quantity: "1", distributedOn: today(), recipientId: "", recipientName: "", location: "", purpose: "", poc: "", remarks: "", ...defaults }
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<DistLineValue>(initial ?? empty)
  const [pending, start] = useTransition()
  const router = useRouter()
  const set = (k: keyof DistLineValue) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(initial ?? empty) }}>
      <DialogTrigger asChild>
        {lineId ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit line">
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" />
            Add line
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{lineId ? "Edit line" : "Add a line"}</DialogTitle>
          <DialogDescription>Changes are recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel>Item</FieldLabel>
            <ItemPicker items={items} value={v.stockItemId} onChange={(id) => setV({ ...v, stockItemId: id })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lq">Quantity</FieldLabel>
            <Input id="lq" type="number" min={1} className="num" value={v.quantity} onChange={set("quantity")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ld">Date</FieldLabel>
            <Input id="ld" type="date" max={today()} value={v.distributedOn} onChange={set("distributedOn")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="le">Emp ID</FieldLabel>
            <Input id="le" value={v.recipientId} onChange={set("recipientId")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ln">Recipient name</FieldLabel>
            <Input id="ln" value={v.recipientName} onChange={set("recipientName")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ll">Location</FieldLabel>
            <Input id="ll" value={v.location} onChange={set("location")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lp">Purpose</FieldLabel>
            <Input id="lp" value={v.purpose} onChange={set("purpose")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lo">POC</FieldLabel>
            <Input id="lo" value={v.poc} onChange={set("poc")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lr">Remarks</FieldLabel>
            <Input id="lr" value={v.remarks} onChange={set("remarks")} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveDistributionLine(requestId, lineId ?? null, v)
                if (!r.ok) return void toast.error(r.error)
                toast.success(r.message)
                setOpen(false)
                router.refresh()
              })
            }
          >
            {pending && <Spinner data-icon="inline-start" />}
            {lineId ? "Save line" : "Add line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReceiptLineDialog({ requestId, lineId, initial, items }: { requestId: string; lineId?: string; initial?: ReceiptLineValue; items: PickItem[] }) {
  const empty: ReceiptLineValue = { stockItemId: "", quantity: "", receivedOn: today(), remarks: "" }
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<ReceiptLineValue>(initial ?? empty)
  const [pending, start] = useTransition()
  const router = useRouter()
  const pick = items.map((i) => ({ ...i, available: Math.max(1, i.available) }))
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(initial ?? empty) }}>
      <DialogTrigger asChild>
        {lineId ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit line">
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" />
            Add line
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lineId ? "Edit line" : "Add a line"}</DialogTitle>
          <DialogDescription>Changes are recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel>Item</FieldLabel>
            <ItemPicker items={pick} value={v.stockItemId} onChange={(id) => setV({ ...v, stockItemId: id })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rq">Quantity received</FieldLabel>
            <Input id="rq" type="number" min={1} className="num" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rd">Received on</FieldLabel>
            <Input id="rd" type="date" max={today()} value={v.receivedOn} onChange={(e) => setV({ ...v, receivedOn: e.target.value })} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="rr">Remarks</FieldLabel>
            <Input id="rr" value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveReceiptLine(requestId, lineId ?? null, v)
                if (!r.ok) return void toast.error(r.error)
                toast.success(r.message)
                setOpen(false)
                router.refresh()
              })
            }
          >
            {pending && <Spinner data-icon="inline-start" />}
            {lineId ? "Save line" : "Add line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RemoveLineButton({ requestId, lineId, label }: { requestId: string; lineId: string; label: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${label}`}>
          <Trash2Icon />
        </Button>
      }
      title="Remove this line?"
      description={`${label} will be taken off this request. The removed values stay in the audit log.`}
      confirmLabel="Remove line"
      destructive
      action={() => removeLines(requestId, [lineId])}
    />
  )
}
