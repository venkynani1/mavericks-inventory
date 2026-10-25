import { importLines, importStockMaster } from "@/lib/server/imports"
import { AppError, assertPermission } from "@/lib/server/session"
import { apiError, codeFor } from "@/lib/server/api"

export const maxDuration = 300
export const dynamic = "force-dynamic"

const MAX_BYTES = 15 * 1024 * 1024

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const user = await assertPermission("stock:write")
    const { kind } = await params
    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof File)) throw new AppError("Choose an Excel file to upload.")
    if (!/\.xlsx$/i.test(file.name)) throw new AppError("Upload an .xlsx file. Save older .xls or .csv files as Excel Workbook (.xlsx) first.")
    if (file.size > MAX_BYTES) throw new AppError("The file is larger than 15 MB. Split it into smaller files.")
    const buf = await file.arrayBuffer()
    // .xlsx files are ZIP archives — reject anything else before parsing.
    const sig = new Uint8Array(buf.slice(0, 4))
    if (!(sig[0] === 0x50 && sig[1] === 0x4b)) throw new AppError("This file isn't a valid Excel workbook.")
    const meta = { title: String(form.get("title") ?? ""), purpose: String(form.get("purpose") ?? "") || undefined }
    const result =
      kind === "stock" ? await importStockMaster(buf, file.name, user)
      : kind === "distribution" || kind === "receipt" ? await importLines(kind, buf, file.name, user, meta)
      : null
    if (!result) throw new AppError("Unknown upload type.", 404)
    return Response.json(result)
  } catch (e) {
    if (e instanceof AppError) return apiError(e.status, codeFor(e.status), e.message)
    console.error(e)
    return apiError(400, "UNREADABLE_FILE", "The file couldn't be read. Check it opens in Excel, then try again.")
  }
}
