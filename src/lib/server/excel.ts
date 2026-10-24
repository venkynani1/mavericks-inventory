import "server-only"
import ExcelJS from "exceljs"

export type Cell = string | number | boolean | Date | null

/** Converts exceljs' many cell shapes (rich text, formulas, hyperlinks) to a plain value. */
function plain(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === "string") {
    // Strip zero-width characters that sneak in from copy-pasted emails/Teams.
    const s = v.replace(/[​-‍﻿]/g, "").trim()
    return s === "" ? null : s
  }
  if (typeof v === "number" || typeof v === "boolean") return v
  if (typeof v === "object") {
    if ("richText" in v) return plain(v.richText.map((r) => r.text).join(""))
    if ("result" in v) return plain(v.result as ExcelJS.CellValue)
    if ("text" in v) return plain(String(v.text))
    if ("error" in v) return null
  }
  return String(v)
}

export const headerKey = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

export type ParsedSheet = { sheetName: string; headers: string[]; rows: { rowNumber: number; values: Record<string, Cell> }[] }

/**
 * Reads the first worksheet whose name matches `prefer` (else the first sheet).
 * Rows are keyed by canonical field names resolved through `aliases`.
 */
export async function readSheet(
  buffer: ArrayBuffer,
  aliases: Record<string, string[]>,
  prefer: RegExp[] = [],
): Promise<ParsedSheet & { missing: string[]; unknownHeaders: string[] }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const sheets = wb.worksheets.filter((s) => s.state === "visible" || !s.state)
  if (!sheets.length) throw new Error("The workbook has no worksheets.")
  const ws = prefer.map((re) => sheets.find((s) => re.test(s.name))).find(Boolean) ?? sheets[0]

  // Header row: first row within the first 10 that matches at least two known headers.
  const lookup = new Map<string, string>()
  for (const [field, names] of Object.entries(aliases)) for (const n of [field, ...names]) lookup.set(headerKey(n), field)
  let headerRow = 1
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const vals = (ws.getRow(r).values as ExcelJS.CellValue[]).slice(1)
    const hits = vals.filter((v) => lookup.has(headerKey(plain(v)))).length
    if (hits >= 2) {
      headerRow = r
      break
    }
  }
  const headerVals = (ws.getRow(headerRow).values as ExcelJS.CellValue[]).slice(1).map((v) => String(plain(v) ?? ""))
  const colField: (string | null)[] = headerVals.map((h) => lookup.get(headerKey(h)) ?? null)
  const unknownHeaders = headerVals.filter((h, i) => h && !colField[i])

  const rows: ParsedSheet["rows"] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow) return
    const values: Record<string, Cell> = {}
    let any = false
    colField.forEach((field, i) => {
      if (!field) return
      const v = plain(row.getCell(i + 1).value)
      if (v !== null) any = true
      if (values[field] === undefined || values[field] === null) values[field] = v
    })
    if (any) rows.push({ rowNumber, values })
  })
  return { sheetName: ws.name, headers: headerVals, rows, missing: [], unknownHeaders }
}

export function presentFields(sheet: ParsedSheet, aliases: Record<string, string[]>) {
  const lookup = new Map<string, string>()
  for (const [field, names] of Object.entries(aliases)) for (const n of [field, ...names]) lookup.set(headerKey(n), field)
  return new Set(sheet.headers.map((h) => lookup.get(headerKey(h))).filter(Boolean) as string[])
}

export function toStr(v: Cell): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  return s === "" ? null : s
}

export function toInt(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim())
  if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN
  return n
}

export function toNum(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,₹\s]/g, ""))
  return Number.isFinite(n) ? n : NaN
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

/** Accepts real dates, Excel serials (e.g. 45870) and dd-mm-yyyy / yyyy-mm-dd / 15 Jul 2025 strings. */
export function toDate(v: Cell): Date | null | "invalid" {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? "invalid" : v
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return "invalid"
    return new Date(Math.round((v - 25569) * 86400 * 1000))
  }
  const s = String(v).trim()
  if (/^\d{5}$/.test(s)) return toDate(Number(s))
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return mk(+m[1], +m[2] - 1, +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) return mk(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1])
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{4})$/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return mk(+m[3], MONTHS[m[2].toLowerCase()], +m[1])
  return "invalid"
}

function mk(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo, d))
  if (dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return "invalid" as const
  return dt
}

// ---------- Writing ----------

const BRAND = "FF1F3F7A"

export function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1)
  row.font = { bold: true, color: { argb: "FFFFFFFF" } }
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
  row.alignment = { vertical: "middle" }
  row.height = 22
  ws.views = [{ state: "frozen", ySplit: 1 }]
}

export type Column = { header: string; key: string; width?: number; numFmt?: string }

export async function buildWorkbook(
  sheets: { name: string; columns: Column[]; rows: Record<string, unknown>[]; note?: string }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Mavericks Inventory"
  wb.created = new Date()
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31))
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4), style: c.numFmt ? { numFmt: c.numFmt } : undefined }))
    styleHeader(ws)
    if (s.rows.length) ws.addRows(s.rows)
    if (s.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } }
  }
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

export function xlsxResponse(buf: Buffer, fileName: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  })
}
