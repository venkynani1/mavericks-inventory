"use client"

import { useActionState, useState } from "react"
import { ArrowRightIcon, BadgeCheckIcon, CrownIcon, GiftIcon, PackageOpenIcon, ShieldCheckIcon, UserRoundIcon } from "lucide-react"
import { login, type LoginState } from "@/app/actions/auth"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type DemoAccount = { email: string; name: string; role: string; does: string; icon: "exec" | "manager" | "authority" | "admin" | "employee" }

const ICON = { exec: PackageOpenIcon, manager: BadgeCheckIcon, authority: CrownIcon, admin: ShieldCheckIcon, employee: GiftIcon }
const TONE = {
  exec: "bg-accent text-primary",
  manager: "bg-approved-soft text-approved",
  authority: "bg-pending-soft text-pending",
  admin: "bg-draft-soft text-foreground",
  employee: "bg-reward-soft text-reward",
}

/** One click signs straight in as that demo person. */
function DemoButton({ d, next, password, disabled, onStart }: { d: DemoAccount; next: string; password: string; disabled: boolean; onStart: () => void }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {})
  const Icon = ICON[d.icon]
  return (
    <form action={action} onSubmit={onStart}>
      <input type="hidden" name="email" value={d.email} />
      <input type="hidden" name="password" value={password} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Sign in as ${d.role}, ${d.name}`}
        className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left outline-none transition hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
      >
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", TONE[d.icon])}>
          {pending ? <Spinner /> : <Icon className="size-5" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">{d.role}</span>
          <span className="truncate text-xs text-muted-foreground">
            {d.name}, {d.does}
          </span>
        </span>
        <ArrowRightIcon className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </button>
      {state.error && <p className="mt-1 text-xs text-rejected">{state.error}</p>}
    </form>
  )
}

export function DemoLogins({ next, demo, password }: { next: string; demo: DemoAccount[]; password: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      {demo.map((d) => (
        <DemoButton key={d.email} d={d} next={next} password={password} disabled={busy} onStart={() => setBusy(true)} />
      ))}
    </div>
  )
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {})
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        <Field data-invalid={!!state.error || undefined}>
          <FieldLabel htmlFor="email">Work email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="username" spellCheck={false} required defaultValue={state.email} aria-invalid={!!state.error || undefined} className="h-10" />
        </Field>
        <Field data-invalid={!!state.error || undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!state.error || undefined} className="h-10" />
        </Field>
      </FieldGroup>
      {state.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : <UserRoundIcon data-icon="inline-start" />}
        Sign in
      </Button>
    </form>
  )
}
