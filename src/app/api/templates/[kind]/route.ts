import { prisma } from "@/lib/db"
import { xlsxResponse } from "@/lib/server/excel"
import { templateWorkbook, type ImportKind } from "@/lib/server/imports"
import { getUser } from "@/lib/server/session"

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await getUser())) return new Response("Not signed in", { status: 401 })
  const { kind } = await params
  if (!["stock", "distribution", "receipt"].includes(kind)) return new Response("Unknown template", { status: 404 })
  const items = kind === "stock" ? [] : await prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { code: true, name: true, availableQty: true }, orderBy: { code: "asc" } })
  const buf = await templateWorkbook(kind as ImportKind, items)
  const name = { stock: "stock-master", distribution: "distribution", receipt: "stock-inward" }[kind as ImportKind]
  return xlsxResponse(buf, `mavericks-${name}-template.xlsx`)
}
