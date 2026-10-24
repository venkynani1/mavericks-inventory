"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { changePassword } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function PasswordForm() {
  const [v, setV] = useState({ current: "", next: "", confirm: "" })
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        setErr(null)
        start(async () => {
          const r = await changePassword(v)
          if (!r.ok) return setErr(r.error)
          toast.success(r.message)
          setV({ current: "", next: "", confirm: "" })
          router.push("/")
          router.refresh()
        })
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cur">Current password</FieldLabel>
          <Input id="cur" type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="new">New password</FieldLabel>
          <Input id="new" type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} />
          <FieldDescription>At least 10 characters, with a letter and a number.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="con">Confirm new password</FieldLabel>
          <Input id="con" type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />
        </Field>
      </FieldGroup>
      {err && <p role="alert" className="rounded-lg bg-rejected-soft px-3 py-2 text-sm text-rejected">{err}</p>}
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        Change password
      </Button>
    </form>
  )
}
