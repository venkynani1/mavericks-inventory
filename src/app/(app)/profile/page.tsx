import type { Metadata } from "next"
import { ROLE_HINT, ROLE_LABEL } from "@/lib/roles"
import { requireUser } from "@/lib/server/session"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader, Panel } from "@/components/app/page-header"
import { PasswordForm } from "@/components/app/password-form"

export const metadata: Metadata = { title: "Profile" }

export default async function Profile() {
  const u = await requireUser()
  return (
    <div className="max-w-3xl">
      <PageHeader title="Profile" description={`${u.email}, employee ID ${u.empId}`} />
      {u.mustChangePw && (
        <Alert className="mb-6 border-pending/30 bg-pending-soft text-pending">
          <AlertTitle>Choose your own password</AlertTitle>
          <AlertDescription className="text-pending/90">You signed in with a one-time password from the administrator. Set a new one to continue.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel className="h-fit p-5">
          <h2 className="text-[15px] font-semibold">{u.name}</h2>
          <p className="mt-3 text-sm font-medium">{ROLE_LABEL[u.role]}</p>
          <p className="text-sm text-muted-foreground">{ROLE_HINT[u.role]}</p>
          <p className="mt-3 text-xs text-muted-foreground">Roles are changed by a System Administrator.</p>
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Change password</h2>
          <PasswordForm />
        </Panel>
      </div>
    </div>
  )
}
