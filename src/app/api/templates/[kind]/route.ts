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
  if (kind === "employees") {
    const buf = await buildWorkbook([
      {
        name: "Employees",
        columns: [
          { header: "Employee ID", key: "empId", width: 16 },
          { header: "Employee Name", key: "name", width: 26 },
          { header: "Email", key: "email", width: 32 },
          { header: "Department", key: "department", width: 22 },
          { header: "Designation", key: "designation", width: 24 },
          { header: "Location", key: "location", width: 14 },
          { header: "Active", key: "active", width: 9 },
        ],
        rows: [
          { empId: "2000200001", name: "Example Person", email: "example.person@hexaware.com", department: "Data & AI", designation: "Software Engineer", location: "Chennai", active: "Yes" },
          { empId: "2000200002", name: "Another Person", email: "", department: "Cloud & Infra", designation: "Associate Software Engineer", location: "Pune", active: "" },
        ],
      },
    ])
    return xlsxResponse(buf, "mavericks-employees-template.xlsx")
  }
  if (kind === "winners") {
    const [positions, items] = await Promise.all([
      prisma.awardPosition.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { code: true, name: true, availableQty: true }, orderBy: { name: "asc" } }),
    ])
    const buf = await buildWorkbook([
      {
        name: "Winners",
        columns: [
          { header: "Employee ID", key: "empId", width: 16 },
          { header: "Employee Name", key: "name", width: 24 },
          { header: "Position", key: "position", width: 18 },
          { header: "Prize type", key: "kind", width: 12 },
          { header: "Voucher amount", key: "amount", width: 15 },
          { header: "Goodie (stock code)", key: "item", width: 20 },
          { header: "Quantity", key: "quantity", width: 10 },
          { header: "Prize description", key: "description", width: 30 },
          { header: "Bonus points", key: "bonus", width: 13 },
        ],
        rows: [
          { empId: "2000149999", name: "Example Winner", position: "Winner", kind: "Voucher", amount: 5000, item: "", quantity: "", description: "Amazon gift voucher", bonus: "" },
          { empId: "2000150001", name: "Example Runner-up", position: "Runner-up", kind: "Goodie", amount: "", item: items[0]?.code ?? "MAV-00001", quantity: 1, description: "", bonus: "" },
          { empId: "2000150003", name: "Example Mention", position: "Special mention", kind: "Other", amount: "", item: "", quantity: "", description: "Trophy and certificate", bonus: 50 },
        ],
      },
      { name: "Positions", columns: [{ header: "Position (use one of these)", key: "name", width: 28 }, { header: "Default bonus points", key: "points", width: 20 }], rows: positions.map((p) => ({ name: p.name, points: p.bonusPoints })) },
      { name: "Stock codes", columns: [{ header: "Stock code", key: "code", width: 14 }, { header: "Item", key: "name", width: 44 }, { header: "Available", key: "qty", width: 11 }], rows: items.map((i) => ({ code: i.code, name: i.name, qty: i.availableQty })) },
    ])
    return xlsxResponse(buf, "mavericks-winners-template.xlsx")
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
