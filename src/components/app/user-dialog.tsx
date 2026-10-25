"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CopyIcon, KeyRoundIcon, PencilIcon, UserPlusIcon } from "lucide-react"
import { createUser, resetPassword, updateUser, type UserInput } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ROLE_HINT, ROLE_LABEL, type Role } from "@/lib/roles"
import { ConfirmAction } from "./confirm-action"

type U = UserInput & { id?: string; active?: boolean }

function TempPassword({ pw, onDone }: { pw: string; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Share this one-time password securely. The user must change it on first sign-in. It won&apos;t be shown again.</p>
      <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2">
        <code className="flex-1 text-base font-semibold tracking-wide">{pw}</code>
        <Button size="icon-sm" variant="ghost" aria-label="Copy password" onClick={() => navigator.clipboard.writeText(pw).then(() => toast.success("Copied"))}>
          <CopyIcon />
        </Button>
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  )
}

export function UserDialog({ user }: { user?: U }) {
  const blank: U = { empId: "", name: "", email: "", role: "EXECUTIVE", department: "", location: "Chennai", active: true }
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<U>(user ?? blank)
  const [pw, setPw] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(user ?? blank); setPw(null); setErr(null) } }}>
      <DialogTrigger asChild>
        {user ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <UserPlusIcon data-icon="inline-start" />
            Add user
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pw ? "User created" : user ? `Edit ${user.name}` : "Add a user"}</DialogTitle>
          {!pw && <DialogDescription>Role decides what the person can do. Executives can&apos;t approve; approvers can&apos;t create requests.</DialogDescription>}
        </DialogHeader>
        {pw ? (
          <TempPassword pw={pw} onDone={() => setOpen(false)} />
        ) : (
          <>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="u-emp">Employee ID</FieldLabel>
                <Input id="u-emp" spellCheck={false} autoComplete="off" value={v.empId} onChange={(e) => setV({ ...v, empId: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="u-name">Full name</FieldLabel>
                <Input id="u-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="u-email">Work email</FieldLabel>
                <Input id="u-email" type="email" spellCheck={false} autoComplete="off" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="u-role">Role</FieldLabel>
                <Select value={v.role} onValueChange={(r) => setV({ ...v, role: r as Role })}>
                  <SelectTrigger id="u-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{ROLE_HINT[v.role as Role]}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="u-dept">Department</FieldLabel>
                <Input id="u-dept" value={v.department ?? ""} onChange={(e) => setV({ ...v, department: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="u-loc">Location</FieldLabel>
                <Input id="u-loc" value={v.location ?? ""} onChange={(e) => setV({ ...v, location: e.target.value })} />
              </Field>
              {user && (
                <Field orientation="horizontal" className="sm:col-span-2">
                  <Switch id="u-active" checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c })} />
                  <FieldLabel htmlFor="u-active">Account active</FieldLabel>
                </Field>
              )}
            </FieldGroup>
            {err && <p role="alert" className="rounded-lg bg-rejected-soft px-3 py-2 text-sm text-rejected">{err}</p>}
            <DialogFooter>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null)
                    if (user?.id) {
                      const r = await updateUser(user.id, { ...v, active: !!v.active })
                      if (!r.ok) return setErr(r.error)
                      toast.success(r.message)
                      setOpen(false)
                    } else {
                      const r = await createUser(v)
                      if (!r.ok) return setErr(r.error)
                      setPw(r.data!.tempPassword)
                    }
                    router.refresh()
                  })
                }
              >
                {pending && <Spinner data-icon="inline-start" />}
                {user ? "Save user" : "Create user"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const [pw, setPw] = useState<string | null>(null)
  return (
    <>
      <ConfirmAction
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Reset password for ${name}`}>
            <KeyRoundIcon />
          </Button>
        }
        title={`Reset ${name}'s password?`}
        description="Their current password stops working. You'll get a one-time password to share."
        confirmLabel="Reset password"
        action={async () => {
          const r = await resetPassword(id)
          if (r.ok) setPw(r.data!.tempPassword)
          return r.ok ? { ok: true, message: "Password reset" } : r
        }}
      />
      <Dialog open={!!pw} onOpenChange={(o) => !o && setPw(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New one-time password</DialogTitle>
          </DialogHeader>
          {pw && <TempPassword pw={pw} onDone={() => setPw(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
