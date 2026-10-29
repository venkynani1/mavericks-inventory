import { prisma } from "@/lib/db"
import { buildWorkbook, xlsxResponse } from "@/lib/server/excel"
import { templateWorkbook, type ImportKind } from "@/lib/server/imports"
import { getUser } from "@/lib/server/session"
import { forbidden, notFound, unauthorized } from "@/lib/server/api"
import { isStaff } from "@/lib/roles"

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getUser()
  if (!user) return unauthorized()
  if (!isStaff(user.role)) return forbidden()
  const { kind } = await params
  if (kind === "attendance") {
    const buf = await buildWorkbook([
      {
        name: "Attendance",
        columns: [
          { header: "Employee ID", key: "empId", width: 16 },
          { header: "Employee Name", key: "name", width: 26 },
          { header: "Email", key: "email", width: 32 },
          { header: "Department", key: "department", width: 22 },
          { header: "Location", key: "location", width: 14 },
        ],
        rows: [{ empId: "2000100001", name: "Example Person", email: "example.person@hexaware.com", department: "Data & AI", location: "Chennai" }],
      },
    ])
    return xlsxResponse(buf, "mavericks-attendance-template.xlsx")
  }
  if (!["stock", "distribution", "receipt"].includes(kind)) return notFound("Template")
  const items = kind === "stock" ? [] : await prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { code: true, name: true, availableQty: true }, orderBy: { code: "asc" } })
  const buf = await templateWorkbook(kind as ImportKind, items)
  const name = { stock: "stock-master", distribution: "distribution", receipt: "stock-inward" }[kind as ImportKind]
  return xlsxResponse(buf, `mavericks-${name}-template.xlsx`)
}
