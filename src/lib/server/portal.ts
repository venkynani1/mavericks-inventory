import "server-only"
import { prisma } from "@/lib/db"
import { requireUser } from "./session"

/** The signed-in person's employee record (portal users are linked; staff are matched by employee ID). */
export async function myEmployee() {
  const user = await requireUser()
  const emp = await prisma.employee.findFirst({ where: { OR: [{ user: { id: user.id } }, { empId: user.empId }] }, select: { id: true } })
  return { user, employeeId: emp?.id ?? null }
}
