import { prisma } from "@/lib/db"
import { buildWorkbook, xlsxResponse } from "@/lib/server/excel"
import type { RowError } from "@/lib/server/imports"
import { getUser } from "@/lib/server/session"
import { notFound, unauthorized } from "@/lib/server/api"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return unauthorized()
  const { id } = await params
  const b = await prisma.uploadBatch.findUnique({ where: { id } })
  if (!b || (b.createdBy !== user.id && user.role !== "ADMIN")) return notFound("Upload")
  const errors = (b.errors as RowError[] | null) ?? []
  const buf = await buildWorkbook([
    {
      name: "Errors",
      columns: [
        { header: "Row in your file", key: "row", width: 16 },
        { header: "Column", key: "field", width: 20 },
        { header: "Value", key: "value", width: 36 },
        { header: "Problem", key: "message", width: 60 },
      ],
      rows: errors,
    },
  ])
  return xlsxResponse(buf, `errors-${b.fileName.replace(/\.xlsx$/i, "")}.xlsx`)
}
