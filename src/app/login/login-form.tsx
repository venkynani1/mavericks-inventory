"use client"

import { useActionState, useRef } from "react"
import { login, type LoginState } from "@/app/actions/auth"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function LoginForm({ next, demo }: { next: string; demo: { email: string; role: string; does: string }[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {})
  const email = useRef<HTMLInputElement>(null)
  const pw = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="next" value={next} />
        <FieldGroup>
          <Field data-invalid={!!state.error || undefined}>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <Input ref={email} id="email" name="email" type="email" autoComplete="username" spellCheck={false} required defaultValue={state.email} aria-invalid={!!state.error || undefined} className="h-10" />
          </Field>
          <Field data-invalid={!!state.error || undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input ref={pw} id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!state.error || undefined} className="h-10" />
          </Field>
        </FieldGroup>
        {state.error && (
          <Alert variant="destructive" aria-live="polite">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" className="h-10" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Sign in
        </Button>
      </form>

      {demo.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground">Demo accounts (password Mavericks@2026). Choose one to fill the form.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {demo.map((d) => (
              <button
                key={d.email}
                type="button"
                className="flex flex-col items-start rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => {
                  if (email.current) email.current.value = d.email
                  if (pw.current) {
                    pw.current.value = "Mavericks@2026"
                    pw.current.focus()
                  }
                }}
              >
                <span className="text-sm font-medium">{d.role}</span>
                <span className="text-[11px] text-muted-foreground">{d.does}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
