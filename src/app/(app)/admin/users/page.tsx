import type { Metadata } from "next"
import { prisma } from "@/lib/db"
import { ROLE_LABEL } from "@/lib/roles"
import { requirePermission } from "@/lib/server/session"
import { fmtDateTime, initials } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Panel } from "@/components/app/page-header"
import { ResetPasswordButton, UserDialog } from "@/components/app/user-dialog"

export const metadata: Metadata = { title: "Users and roles" }

export default async function Users() {
  const me = await requirePermission("admin:manage")
  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] })
  return (
    <>
      <PageHeader title="Users and roles" description="Who can sign in and what they're allowed to do. Deactivated users lose access immediately; their history stays." actions={<UserDialog />} />
      <Panel className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
              <TableHead className="w-24 pr-5"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.active ? undefined : "opacity-60"}>
                <TableCell className="pl-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {u.name} {u.id === me.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {u.email} ({u.empId})
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {ROLE_LABEL[u.role]}
                  {!u.active && <span className="block text-xs text-rejected">Deactivated</span>}
                  {u.mustChangePw && u.active && <span className="block text-xs text-pending">Must change password</span>}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{u.department ?? "—"}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</TableCell>
                <TableCell className="pr-5">
                  <div className="flex justify-end">
                    <UserDialog user={{ id: u.id, empId: u.empId, name: u.name, email: u.email, role: u.role, department: u.department ?? "", location: u.location ?? "", active: u.active }} />
                    <ResetPasswordButton id={u.id} name={u.name} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </>
  )
}
