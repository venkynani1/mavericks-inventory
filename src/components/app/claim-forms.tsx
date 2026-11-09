"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckIcon, DoorClosedIcon, DoorOpenIcon, XIcon } from "lucide-react"
import { claimGoodie, closeGoodiesDesk, handOverGoodie, openGoodiesDesk, rejectGoodieClaim } from "@/app/actions/claims"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { fmtNum } from "@/lib/utils"

/** Refreshes the page every few seconds so new claims appear without anyone reloading. */
export function AutoRefresh({ every = 4000 }: { every?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, every)
    return () => clearInterval(t)
  }, [router, every])
  return null
}

export function DeskControls({ eventId, open, stockItemId, qty, options }: { eventId: string; open: boolean; stockItemId: string | null; qty: number; options: { id: string; name: string; remaining: number }[] }) {
  const [item, setItem] = useState(stockItemId ?? options.find((o) => o.remaining > 0)?.id ?? "")
  const [n, setN] = useState(String(qty || 1))
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const go = (fn: () => ReturnType<typeof closeGoodiesDesk>) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (!r.ok) return setError(r.error)
      if (r.message) toast.success(r.message)
      router.refresh()
    })
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
        <Field>
          <FieldLabel htmlFor="desk-item">Goodie at this desk</FieldLabel>
          <Select value={item} onValueChange={setItem}>
            <SelectTrigger id="desk-item" className="w-full"><SelectValue placeholder="Choose an approved goodie" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id} disabled={o.remaining <= 0}>{o.name} ({fmtNum(o.remaining)} left)</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="desk-qty">Per person</FieldLabel>
          <Input id="desk-qty" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      </div>
      {error && <p role="alert" className="rounded-lg bg-rejected-soft px-3 py-2 text-sm text-rejected">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !item} onClick={() => go(() => openGoodiesDesk(eventId, item, Number(n) || 1))}>
          {pending ? <Spinner data-icon="inline-start" /> : <DoorOpenIcon data-icon="inline-start" />}
          {open ? "Update desk" : "Open desk and show QR"}
        </Button>
        {open && (
          <Button variant="outline" disabled={pending} onClick={() => go(() => closeGoodiesDesk(eventId))}>
            <DoorClosedIcon data-icon="inline-start" />
            Close desk
          </Button>
        )}
      </div>
    </div>
  )
}

export function ClaimActions({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>, ok: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.error)
      else toast.success(ok)
      router.refresh()
    })
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => act(() => handOverGoodie(id), `Handed over to ${name}`)}>
        {pending ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
        Hand over
      </Button>
      <Button size="sm" variant="ghost" className="text-rejected" disabled={pending} aria-label={`Reject the claim by ${name}`} onClick={() => act(() => rejectGoodieClaim(id, "Rejected at the desk"), "Claim rejected")}>
        <XIcon />
      </Button>
    </div>
  )
}

/** The public form the QR code opens. */
export function ClaimForm({ token }: { token: string }) {
  const [empId, setEmpId] = useState("")
  const [name, setName] = useState("")
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          const r = await claimGoodie(token, empId, name)
          if (!r.ok) return setError(r.error)
          router.replace(`/claim/${token}?c=${(r.data as { id: string }).id}`)
        })
      }}
    >
      <Field>
        <FieldLabel htmlFor="cl-id">Employee ID</FieldLabel>
        <Input id="cl-id" inputMode="numeric" autoComplete="off" required value={empId} onChange={(e) => (setEmpId(e.target.value.replace(/[^0-9]/g, "")), setError(null))} placeholder="e.g. 2000149999" className="h-12 text-lg" />
      </Field>
      <Field>
        <FieldLabel htmlFor="cl-name">Your name</FieldLabel>
        <Input id="cl-name" autoComplete="name" required value={name} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="As in your Hexaware records" className="h-12 text-lg" />
      </Field>
      {error && <p role="alert" className="rounded-lg bg-rejected-soft px-3 py-2 text-sm text-rejected">{error}</p>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        Claim my goodie
      </Button>
    </form>
  )
}
