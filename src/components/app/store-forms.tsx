"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { BadgeCheckIcon, CalendarClockIcon, GiftIcon, MinusIcon, PackageCheckIcon, PencilIcon, PlusIcon, ShoppingCartIcon, Trash2Icon, Undo2Icon, XCircleIcon } from "lucide-react"
import { acceptStoreOrder, cancelStoreOrder, collectStoreOrder, placeStoreOrder, rejectStoreOrder, requestGoodiesForEvent, returnGoodiesFromEvent, saveStoreItem } from "@/app/actions/store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn, fmtNum } from "@/lib/utils"

type Res<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string }

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return <p role="alert" className="rounded-lg bg-rejected-soft px-3 py-2 text-sm text-rejected">{error}</p>
}

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

const Opt = ({ value, onChange, options, id, placeholder, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id?: string; placeholder?: string; label?: string }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger id={id} className="w-full" aria-label={label}>
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

type StockOption = { id: string; name: string; availableQty: number }

// ---------------- administrator: store catalogue ----------------

export type StoreItemRow = { id: string; name: string; description: string | null; stockItemId: string; pointsCost: number; active: boolean }

export function StoreItemDialog({ item, stockItems }: { item?: StoreItemRow; stockItems: StockOption[] }) {
  const [open, setOpen] = useState(false)
  const init = { name: item?.name ?? "", description: item?.description ?? "", stockItemId: item?.stockItemId ?? "", pointsCost: item ? String(item.pointsCost) : "2000", active: item?.active ?? true }
  const [v, setV] = useState(init)
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setV(init), setError(null)))}>
      <DialogTrigger asChild>
        {item ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button size="sm">
            <PlusIcon data-icon="inline-start" />
            Add goodie
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit store goodie" : "Add a goodie to the store"}</DialogTitle>
          <DialogDescription>Employees can order it once they have this many points. The points are deducted when they place the order.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="si-name">Name in the store</FieldLabel>
            <Input id="si-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Mavericks backpack" />
          </Field>
          <Field>
            <FieldLabel htmlFor="si-stock">Comes from stock item</FieldLabel>
            <Opt id="si-stock" value={v.stockItemId} onChange={(x) => setV({ ...v, stockItemId: x, name: v.name || stockItems.find((s) => s.id === x)?.name || "" })} placeholder="Choose the item" options={stockItems.map((s) => ({ value: s.id, label: `${s.name} (${fmtNum(s.availableQty)} in stock)` }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="si-cost">Points price</FieldLabel>
            <Input id="si-cost" inputMode="numeric" value={v.pointsCost} onChange={(e) => setV({ ...v, pointsCost: e.target.value.replace(/[^0-9]/g, "") })} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="si-desc">Description (optional)</FieldLabel>
            <Input id="si-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="e.g. 25 L, laptop sleeve, navy" />
          </Field>
          <Field orientation="horizontal" className="sm:col-span-2">
            <Switch id="si-active" checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c })} />
            <FieldLabel htmlFor="si-active">Show in the store</FieldLabel>
          </Field>
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button disabled={pending} onClick={() => submit(() => saveStoreItem(item?.id ?? null, { ...v, pointsCost: Number(v.pointsCost) }), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- employee: store and cart ----------------

export type StoreProduct = { id: string; name: string; description: string | null; pointsCost: number; inStock: number }

const CART_KEY = "mi-store-cart"

export function StoreFront({ products, points, openOrders }: { products: StoreProduct[]; points: number; openOrders: number }) {
  const [cart, setCart] = useState<Record<string, number>>({})
  const [note, setNote] = useState("")
  const { pending, error, submit } = useSubmit()
  const router = useRouter()

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) ?? "{}") as Record<string, number>
      const valid = Object.fromEntries(Object.entries(saved).filter(([id, q]) => products.some((p) => p.id === id) && q > 0))
      setCart(valid)
    } catch {
      /* storage unavailable */
    }
  }, [products])
  const save = (next: Record<string, number>) => {
    setCart(next)
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }
  const setQty = (id: string, q: number) => {
    const next = { ...cart }
    if (q <= 0) delete next[id]
    else next[id] = Math.min(q, 5)
    save(next)
  }

  const lines = useMemo(() => products.filter((p) => cart[p.id]).map((p) => ({ ...p, qty: cart[p.id] })), [products, cart])
  const total = lines.reduce((s, l) => s + l.pointsCost * l.qty, 0)
  const after = points - total
  const cheapest = products.length ? Math.min(...products.map((p) => p.pointsCost)) : 0

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {points < cheapest && (
          <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            You have <span className="font-semibold text-foreground num">{fmtNum(points)}</span> points. The first goodie is at <span className="num font-semibold text-foreground">{fmtNum(cheapest)}</span>, so you need <span className="num font-semibold text-foreground">{fmtNum(cheapest - points)}</span> more. Keep attending events!
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Goodies in the store">
          {products.map((p) => {
            const inCart = cart[p.id] ?? 0
            const affordable = p.pointsCost <= after + inCart * p.pointsCost && p.pointsCost <= points
            const short = Math.max(0, p.pointsCost - points)
            const pct = Math.min(100, Math.round((points / p.pointsCost) * 100))
            return (
              <li key={p.id} className="flex flex-col rounded-xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><GiftIcon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium leading-tight">{p.name}</h3>
                    {p.description && <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="num text-lg font-semibold">{fmtNum(p.pointsCost)} <span className="text-xs font-normal text-muted-foreground">points</span></span>
                  {p.inStock <= 0 ? <Badge variant="outline">Out of stock</Badge> : short ? <span className="num text-xs text-muted-foreground">{fmtNum(short)} more needed</span> : <Badge className="bg-approved-soft text-approved">You can get this</Badge>}
                </div>
                {short > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of the way to ${p.name}`}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="mt-auto pt-3">
                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon-sm" aria-label={`One less ${p.name}`} onClick={() => setQty(p.id, inCart - 1)}><MinusIcon /></Button>
                      <span className="num w-6 text-center font-medium" aria-live="polite">{inCart}</span>
                      <Button variant="outline" size="icon-sm" aria-label={`One more ${p.name}`} disabled={inCart >= 5 || inCart >= p.inStock || p.pointsCost > after} onClick={() => setQty(p.id, inCart + 1)}><PlusIcon /></Button>
                      <span className="ml-auto text-xs text-muted-foreground">In cart</span>
                    </div>
                  ) : (
                    <Button className="w-full" variant={affordable ? "default" : "outline"} disabled={p.inStock <= 0 || p.pointsCost > after} onClick={() => setQty(p.id, 1)}>
                      <ShoppingCartIcon data-icon="inline-start" />
                      {p.pointsCost <= points && p.pointsCost > after ? "Not enough with your cart" : "Add to cart"}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <aside aria-label="Your cart" className="h-fit rounded-xl border bg-card lg:sticky lg:top-20">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ShoppingCartIcon className="size-4" />
          <h2 className="font-medium">Your cart</h2>
          {lines.length > 0 && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => save({})}>Empty</Button>}
        </div>
        {lines.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Add goodies you can afford. You can also keep saving for a bigger one.{openOrders > 0 && ` You have ${openOrders} order${openOrders > 1 ? "s" : ""} in progress.`}</p>
        ) : (
          <ul className="divide-y">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.name}{l.qty > 1 && <span className="text-muted-foreground"> x{l.qty}</span>}</span>
                <span className="num">{fmtNum(l.pointsCost * l.qty)}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${l.name}`} onClick={() => setQty(l.id, 0)}><Trash2Icon /></Button>
              </li>
            ))}
          </ul>
        )}
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 border-t px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Your points</dt>
          <dd className="num text-right">{fmtNum(points)}</dd>
          <dt className="text-muted-foreground">This order</dt>
          <dd className="num text-right">−{fmtNum(total)}</dd>
          <dt className="font-medium">Left after the order</dt>
          <dd className={cn("num text-right font-semibold", after < 0 && "text-rejected")}>{fmtNum(after)}</dd>
        </dl>
        {lines.length > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3">
            <Field>
              <FieldLabel htmlFor="st-note">Note for the team (optional)</FieldLabel>
              <Input id="st-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I sit in Chennai, 4th floor" />
            </Field>
            <ErrorNote error={error} />
            <Button
              disabled={pending || after < 0}
              onClick={() =>
                submit(() => placeStoreOrder(lines.map((l) => ({ catalogItemId: l.id, quantity: l.qty })), note), (r) => {
                  const d = r.data as { number: string; balance: number }
                  toast.success(`Order ${d.number} placed. ${fmtNum(d.balance)} points left. The team will tell you where and when to collect it.`)
                  save({})
                  setNote("")
                  router.push("/me/orders")
                })
              }
            >
              {pending ? <Spinner data-icon="inline-start" /> : <BadgeCheckIcon data-icon="inline-start" />}
              Place order for {fmtNum(total)} points
            </Button>
            <p className="text-xs text-muted-foreground">Points are deducted when you place the order and come back if it&apos;s rejected or you cancel before the team accepts it.</p>
          </div>
        )}
      </aside>
    </div>
  )
}

export function CancelOrderButton({ id, number }: { id: string; number: string }) {
  const [open, setOpen] = useState(false)
  const { pending, error, setError, submit } = useSubmit()
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && setError(null))}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Cancel order</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {number}?</DialogTitle>
          <DialogDescription>Your points come straight back.</DialogDescription>
        </DialogHeader>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button variant="destructive" disabled={pending} onClick={() => submit(() => cancelStoreOrder(id), () => setOpen(false))}>
            {pending && <Spinner data-icon="inline-start" />}
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- engagement team: orders ----------------

function defaultPickup() {
  const d = new Date(Date.now() + 86400_000)
  d.setHours(15, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export type OrderForActions = { id: string; number: string; status: string; employee: string; location: string | null; pickupLocation: string | null; pickupAt: string | null; pickupNote: string | null }

export function OrderActions({ order, locations }: { order: OrderForActions; locations: string[] }) {
  const [mode, setMode] = useState<"accept" | "reject" | null>(null)
  const init = { location: order.pickupLocation ?? (order.location ? `${order.location} office, engagement desk` : ""), pickupAt: order.pickupAt ? toLocalInput(order.pickupAt) : defaultPickup(), note: order.pickupNote ?? "" }
  const [v, setV] = useState(init)
  const [reason, setReason] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  const open = (m: "accept" | "reject") => (setV(init), setReason(""), setError(null), setMode(m))
  const accepted = order.status === "ACCEPTED"
  return (
    <div className="flex flex-wrap gap-2">
      {order.status === "PLACED" && (
        <Button size="sm" onClick={() => open("accept")}>
          <CalendarClockIcon data-icon="inline-start" />
          Accept and set pickup
        </Button>
      )}
      {accepted && (
        <>
          <Button size="sm" disabled={pending} onClick={() => submit(() => collectStoreOrder(order.id))}>
            {pending && mode === null ? <Spinner data-icon="inline-start" /> : <PackageCheckIcon data-icon="inline-start" />}
            Mark collected
          </Button>
          <Button size="sm" variant="outline" onClick={() => open("accept")}>
            <CalendarClockIcon data-icon="inline-start" />
            Change pickup
          </Button>
        </>
      )}
      {(order.status === "PLACED" || accepted) && (
        <Button size="sm" variant="ghost" className="text-rejected" onClick={() => open("reject")}>
          <XCircleIcon data-icon="inline-start" />
          Reject
        </Button>
      )}
      {error && mode === null && <p className="w-full text-xs text-rejected">{error}</p>}

      <Dialog open={mode === "accept"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{accepted ? `Change pickup for ${order.number}` : `Accept ${order.number}`}</DialogTitle>
            <DialogDescription>
              {accepted ? "The employee sees the new place and time." : `Tell ${order.employee} where and when to collect. The goodies are taken out of stock now and set aside for them.`}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pk-loc">Pickup place</FieldLabel>
              <Input id="pk-loc" list="pk-locs" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="e.g. Chennai office, 2nd floor engagement desk" />
              <datalist id="pk-locs">{locations.map((l) => <option key={l} value={`${l} office, engagement desk`} />)}</datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="pk-at">Date and time</FieldLabel>
              <Input id="pk-at" type="datetime-local" value={v.pickupAt} onChange={(e) => setV({ ...v, pickupAt: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pk-note">Note (optional)</FieldLabel>
              <Input id="pk-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="e.g. Bring your ID card. Ask for Ravi." />
            </Field>
          </FieldGroup>
          <ErrorNote error={error} />
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() =>
                submit(() => acceptStoreOrder(order.id, { location: v.location, pickupAt: v.pickupAt ? new Date(v.pickupAt).toISOString() : "", note: v.note }), (r) => {
                  const d = r.data as { number: string; rescheduled: boolean }
                  toast.success(d.rescheduled ? `Pickup for ${d.number} changed` : `${d.number} accepted. ${order.employee} can see the pickup details.`)
                  setMode(null)
                })
              }
            >
              {pending && <Spinner data-icon="inline-start" />}
              {accepted ? "Save pickup" : "Accept order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "reject"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {order.number}?</DialogTitle>
            <DialogDescription>{order.employee} gets all the points back{accepted ? " and the goodies go back to stock" : ""}. They see your reason.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="rj-reason">Reason</FieldLabel>
            <Textarea id="rj-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Size out of stock until next month; please order again then" />
          </Field>
          <ErrorNote error={error} />
          <DialogFooter>
            <Button variant="destructive" disabled={pending} onClick={() => submit(() => rejectStoreOrder(order.id, reason), () => setMode(null))}>
              {pending && <Spinner data-icon="inline-start" />}
              Reject and refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------- event goodies (approved before the event) ----------------

export function EventGoodiesDialog({ eventId, eventName, items }: { eventId: string; eventName: string; items: StockOption[] }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<{ stockItemId: string; quantity: string }[]>([{ stockItemId: "", quantity: "" }])
  const [note, setNote] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  const router = useRouter()
  const reset = () => (setRows([{ stockItemId: "", quantity: "" }]), setNote(""), setError(null))
  const send = (submitNow: boolean) =>
    submit(
      () => requestGoodiesForEvent(eventId, rows.filter((r) => r.stockItemId || r.quantity).map((r) => ({ stockItemId: r.stockItemId, quantity: Number(r.quantity) })), note, submitNow),
      (r) => {
        const d = r.data as { id: string; number: string }
        toast.success(submitNow ? `${d.number} sent to the manager for approval` : `${d.number} saved as a draft`)
        setOpen(false)
        router.push(`/requests/${d.id}`)
      },
    )
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && reset())}>
      <DialogTrigger asChild>
        <Button size="sm">
          <GiftIcon data-icon="inline-start" />
          Request goodies
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Goodies for {eventName}</DialogTitle>
          <DialogDescription>List what the event needs. The manager approves before the event and the stock goes down at approval. Goodie prizes for this event are then taken from these, with no second approval.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const it = items.find((x) => x.id === r.stockItemId)
            const over = it && Number(r.quantity) > it.availableQty
            return (
              <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-start gap-2">
                <div>
                  <Opt label={`Goodie ${i + 1}`} value={r.stockItemId} onChange={(x) => setRows(rows.map((y, j) => (j === i ? { ...y, stockItemId: x } : y)))} placeholder="Choose a goodie" options={items.map((s) => ({ value: s.id, label: `${s.name} (${fmtNum(s.availableQty)} in stock)` }))} />
                  {over && <p className="mt-1 text-xs text-rejected">Only {fmtNum(it.availableQty)} in stock</p>}
                </div>
                <Input aria-label={`Quantity ${i + 1}`} inputMode="numeric" placeholder="Qty" value={r.quantity} onChange={(e) => setRows(rows.map((y, j) => (j === i ? { ...y, quantity: e.target.value.replace(/[^0-9]/g, "") } : y)))} />
                <Button variant="ghost" size="icon-sm" className="mt-1" aria-label={`Remove line ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2Icon /></Button>
              </div>
            )
          })}
          <div>
            <Button variant="outline" size="sm" onClick={() => setRows([...rows, { stockItemId: "", quantity: "" }])}>
              <PlusIcon data-icon="inline-start" />
              Add another goodie
            </Button>
          </div>
          <Field>
            <FieldLabel htmlFor="eg-note">Note for the manager (optional)</FieldLabel>
            <Input id="eg-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 120 registrations; T-shirts for volunteers, bottles for all" />
          </Field>
        </div>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => send(false)}>Save draft</Button>
          <Button disabled={pending} onClick={() => send(true)}>
            {pending && <Spinner data-icon="inline-start" />}
            Send for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReturnGoodiesDialog({ eventId, rows }: { eventId: string; rows: { stockItemId: string; name: string; remaining: number }[] }) {
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [note, setNote] = useState("")
  const { pending, error, setError, submit } = useSubmit()
  const router = useRouter()
  const left = rows.filter((r) => r.remaining > 0)
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setQty({}), setNote(""), setError(null)))}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!left.length}>
          <Undo2Icon data-icon="inline-start" />
          Return unused
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return unused goodies to stock</DialogTitle>
          <DialogDescription>Enter how many of each came back. It goes to the manager like any stock inward, and stock goes up when approved.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {left.map((r) => (
            <Field key={r.stockItemId} orientation="horizontal">
              <FieldLabel htmlFor={`rt-${r.stockItemId}`} className="flex-1">
                {r.name}
                <FieldDescription className="num">{fmtNum(r.remaining)} left from this event</FieldDescription>
              </FieldLabel>
              <Input id={`rt-${r.stockItemId}`} className="w-24" inputMode="numeric" value={qty[r.stockItemId] ?? ""} onChange={(e) => setQty({ ...qty, [r.stockItemId]: e.target.value.replace(/[^0-9]/g, "") })} />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="rt-note">Note (optional)</FieldLabel>
            <Input id="rt-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </FieldGroup>
        <ErrorNote error={error} />
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              submit(
                () => returnGoodiesFromEvent(eventId, Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([stockItemId, q]) => ({ stockItemId, quantity: Number(q) })), note),
                (r) => {
                  const d = r.data as { id: string; number: string }
                  toast.success(`${d.number} sent for approval`)
                  setOpen(false)
                  router.push(`/requests/${d.id}`)
                },
              )
            }
          >
            {pending && <Spinner data-icon="inline-start" />}
            Send for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
