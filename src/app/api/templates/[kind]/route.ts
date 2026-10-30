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
  if (kind === "events") {
    const types = await prisma.eventType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })
    const d = (days: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + days * 86400_000)).replace(/\//g, "-")
    const buf = await buildWorkbook([
      {
        name: "Events",
        columns: [
          { header: "Event name", key: "name", width: 36 },
          { header: "Event type", key: "type", width: 18 },
          { header: "Date", key: "date", width: 14 },
          { header: "Location", key: "location", width: 14 },
          { header: "Organiser", key: "organizer", width: 18 },
          { header: "Points", key: "points", width: 9 },
          { header: "Description", key: "description", width: 40 },
        ],
        rows: [
          { name: "Tech talk: Observability with OpenTelemetry", type: "Tech talk", date: d(10), location: "Chennai", organizer: "Kavin Raj", points: "", description: "Leave Points empty to use the event type's points" },
          { name: "Hackathon: GenAI for internal tools", type: "Hackathon", date: d(24), location: "Chennai", organizer: "Divya Menon", points: 800, description: "Flagship event, points overridden" },
        ],
      },
      { name: "Event types", columns: [{ header: "Event type (use one of these)", key: "name", width: 30 }, { header: "Points", key: "points", width: 10 }], rows: types.map((t) => ({ name: t.name, points: t.points })) },
    ])
    return xlsxResponse(buf, "mavericks-events-template.xlsx")
  }
  if (!["stock", "distribution", "receipt"].includes(kind)) return notFound("Template")
  const items = kind === "stock" ? [] : await prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { code: true, name: true, availableQty: true }, orderBy: { code: "asc" } })
  const buf = await templateWorkbook(kind as ImportKind, items)
  const name = { stock: "stock-master", distribution: "distribution", receipt: "stock-inward" }[kind as ImportKind]
  return xlsxResponse(buf, `mavericks-${name}-template.xlsx`)
}
