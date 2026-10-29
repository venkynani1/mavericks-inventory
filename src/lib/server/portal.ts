import "server-only"
import { prisma } from "@/lib/db"
import { requireUser } from "./session"

/** The signed-in person's employee record (portal users are linked; staff are matched by employee ID). */
export async function myEmployee() {
  const user = await requireUser()
  const emp = await prisma.employee.findFirst({ where: { OR: [{ user: { id: user.id } }, { empId: user.empId }] }, select: { id: true } })
  return { user, employeeId: emp?.id ?? null }
}

/**
 * Portal accounts (role EMPLOYEE) are tied to an employee record, matched by employee ID and then by
 * email. If none exists yet, one is created, so a new joiner can sign in before attending any event.
 */
export async function linkEmployee(user: { id: string; empId: string; name: string; email: string; role: string; employeeId?: string | null }) {
  if (user.role !== "EMPLOYEE" || user.employeeId) return user.employeeId ?? null
  const emp =
    (await prisma.employee.findUnique({ where: { empId: user.empId } })) ??
    (await prisma.employee.findFirst({ where: { email: { equals: user.email, mode: "insensitive" } } })) ??
    (await prisma.employee.create({ data: { empId: user.empId, name: user.name, email: user.email.toLowerCase() } }))
  const taken = await prisma.user.findFirst({ where: { employeeId: emp.id, NOT: { id: user.id } }, select: { id: true } })
  if (taken) return null
  await prisma.user.update({ where: { id: user.id }, data: { employeeId: emp.id } })
  return emp.id
}
