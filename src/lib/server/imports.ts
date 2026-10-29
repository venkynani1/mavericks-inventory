import "server-only"
import ExcelJS from "exceljs"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { normKey } from "@/lib/utils"
import { audit } from "./audit"
import { presentFields, readSheet, styleHeader, toDate, toInt, toNum, toStr } from "./excel"
import { AppError, type SessionUser } from "./session"
import { nextRequestNumber, nextStockCode, recomputeTotals } from "./workflow"

export const MAX_ROWS = 50_000
export type RowError = { row: number; field: string; value?: string; message: string }
export type ImportKind = "stock" | "distribution" | "receipt"

// ---------- Column definitions (template + accepted aliases from the legacy trackers) ----------

export const STOCK_ALIASES: Record<string, string[]> = {
  code: ["Stock Code", "Item Code", "SKU"],
  name: ["Stock Name", "Product Details", "Item Name"],
  product: ["Product", "Product Name"],
  category: ["Category", "Catogory", "Item Category"],
  size: ["Size", "Size / Quantity", "Size/Quantity"],
  color: ["Color", "Colour"],
  brand: ["Brand"],
  unit: ["Unit of Measure", "UOM", "Unit"],
  openingQty: ["Opening Quantity", "Opening Qty", "Available", "Availabe", "Available Stock", "Quantity"],
  location: ["Location", "Store Location"],
  unitCost: ["Unit Cost", "Product cost", "Cost"],
  reorderLevel: ["Reorder Level", "Minimum Stock"],
}

export const DIST_ALIASES: Record<string, string[]> = {
  code: ["Stock Code", "Item Code", "SKU"],
  itemName: ["Product Details", "Stock Name", "Item"],
  quantity: ["Quantity", "Qty", "Quantity Distributed"],
  date: ["Distribution Date", "Date of Delivery", "Date", "Delivered On"],
  recipientId: ["Emp ID", "Employee ID", "EmpID"],
  recipientName: ["Recipient Name", "Name", "Recipient"],
  location: ["Base Location", "Location"],
  purpose: ["Purpose", "Category", "Catogory", "Event"],
  poc: ["POC", "Point of Contact"],
  remarks: ["Remarks", "Comments", "Notes"],
}

export const RECEIPT_ALIASES: Record<string, string[]> = {
  code: ["Stock Code", "Item Code", "SKU"],
  itemName: ["Product Details", "Stock Name"],
  quantity: ["Quantity Received", "Procured", "Quantity", "Qty"],
  date: ["Received Date", "Date", "Procured Date"],
  remarks: ["Remarks", "Notes", "Vendor / Reference"],
}

/** Best-effort category for legacy rows that have none. */
export function guessCategory(product: string) {
  const p = product.toLowerCase()
  if (/t-?shirt|hoodie|cap|jacket/.test(p)) return "Apparel"
  if (/welcome kit|kit/.test(p)) return "Welcome Kits"
  if (/bottle|flask|mug|tumbler/.test(p)) return "Drinkware"
  if (/bag/.test(p)) return "Bags"
  if (/headphone|speaker|watch|mouse|keyboard|earbud|charger/.test(p)) return "Electronics"
  if (/pen|diary|notebook|sticker|badge/.test(p)) return "Stationery"
  return "General"
}

async function ensureCategory(tx: Prisma.TransactionClient, name: string, cache: Map<string, string>) {
  const key = name.toLowerCase()
  if (cache.has(key)) return cache.get(key)!
  const existing = await tx.category.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })
  const id = existing?.id ?? (await tx.category.create({ data: { name } })).id
  cache.set(key, id)
  return id
}

function err(errors: RowError[], row: number, field: string, message: string, value?: unknown) {
  errors.push({ row, field, message, value: value === undefined || value === null ? undefined : String(value) })
}

/** Index of active items by code and by normalised name, for matching upload rows. */
async function itemIndex(statuses: ("ACTIVE" | "DRAFT")[] = ["ACTIVE"]) {
  const items = await prisma.stockItem.findMany({
    where: { status: { in: statuses } },
    select: { id: true, code: true, name: true, availableQty: true, status: true },
  })
  const byCode = new Map(items.map((i) => [i.code.toLowerCase(), i]))
  const byName = new Map(items.map((i) => [normKey(i.name), i]))
  return { byCode, byName }
}

async function finishBatch(kind: string, fileName: string, total: number, valid: number, errors: RowError[], user: SessionUser) {
  return prisma.uploadBatch.create({
    data: {
      kind,
      fileName,
      totalRows: total,
      validRows: valid,
      errorRows: new Set(errors.map((e) => e.row)).size,
      errors: errors.slice(0, 5000) as unknown as Prisma.InputJsonValue,
      createdBy: user.id,
    },
  })
}

export type ImportResult = {
  batchId: string
  requestId: string | null
  requestNumber: string | null
  total: number
  valid: number
  errorRows: number
  errors: RowError[]
  warnings: string[]
}

// ---------- Stock master ----------

export async function importStockMaster(buf: ArrayBuffer, fileName: string, user: SessionUser): Promise<ImportResult> {
  const sheet = await readSheet(buf, STOCK_ALIASES, [/stock/i, /master/i])
  const present = presentFields(sheet, STOCK_ALIASES)
  const required = ["name", "product", "openingQty"]
  const missing = required.filter((f) => !present.has(f))
  if (missing.length)
    throw new AppError(`The file is missing required columns: ${missing.map((m) => STOCK_ALIASES[m][0]).join(", ")}. Download the template to see the expected layout.`)
  if (sheet.rows.length > MAX_ROWS) throw new AppError(`This file has ${sheet.rows.length} rows. The limit is ${MAX_ROWS.toLocaleString()} per upload.`)
  if (!sheet.rows.length) throw new AppError("The sheet has a header row but no data rows.")

  const errors: RowError[] = []
  const warnings: string[] = []
  const existing = await prisma.stockItem.findMany({ where: { status: { not: "INACTIVE" } }, select: { code: true, name: true } })
  const codes = new Set(existing.map((e) => e.code.toLowerCase()))
  const names = new Set(existing.map((e) => normKey(e.name)))
  const seenCodes = new Set<string>()
  const seenNames = new Set<string>()

  type Valid = { code: string | null; name: string; product: string; category: string; size: string | null; color: string | null; brand: string | null; unit: string; openingQty: number; location: string | null; unitCost: number | null; reorderLevel: number }
  const valid: Valid[] = []
  let guessed = 0

  for (const { rowNumber: r, values: v } of sheet.rows) {
    const before = errors.length
    const name = toStr(v.name)
    const product = toStr(v.product)
    const code = toStr(v.code)
    const qty = toInt(v.openingQty)
    const cost = toNum(v.unitCost)
    const reorder = toInt(v.reorderLevel)
    if (!name) err(errors, r, "Stock Name", "Stock name is required")
    if (!product) err(errors, r, "Product", "Product is required")
    if (qty === null) err(errors, r, "Opening Quantity", "Opening quantity is required")
    else if (Number.isNaN(qty) || qty < 0) err(errors, r, "Opening Quantity", "Must be a whole number, 0 or more", v.openingQty)
    if (Number.isNaN(cost as number) || (cost !== null && cost < 0)) err(errors, r, "Unit Cost", "Must be a number, 0 or more", v.unitCost)
    if (Number.isNaN(reorder as number) || (reorder !== null && reorder < 0)) err(errors, r, "Reorder Level", "Must be a whole number, 0 or more", v.reorderLevel)
    if (code) {
      if (!/^[A-Za-z0-9._/-]{2,40}$/.test(code)) err(errors, r, "Stock Code", "Use 2–40 letters, numbers, dot, dash or slash", code)
      else if (codes.has(code.toLowerCase())) err(errors, r, "Stock Code", "This code already exists in the system", code)
      else if (seenCodes.has(code.toLowerCase())) err(errors, r, "Stock Code", "Duplicate code within this file", code)
    }
    if (name) {
      const k = normKey(name)
      if (names.has(k)) err(errors, r, "Stock Name", "An item with this name already exists", name)
      else if (seenNames.has(k)) err(errors, r, "Stock Name", "Duplicate item within this file", name)
    }
    if (errors.length > before) continue
    if (code) seenCodes.add(code.toLowerCase())
    seenNames.add(normKey(name!))
    let category = toStr(v.category)
    if (!category) {
      category = guessCategory(product!)
      guessed++
    }
    valid.push({
      code,
      name: name!,
      product: product!,
      category,
      size: toStr(v.size),
      color: toStr(v.color),
      brand: toStr(v.brand),
      unit: toStr(v.unit) ?? "Nos",
      openingQty: qty as number,
      location: toStr(v.location),
      unitCost: cost,
      reorderLevel: (reorder as number) ?? 0,
    })
  }
  if (guessed) warnings.push(guessed === 1 ? "1 row had no category, so one was chosen from the product name. Check it before submitting." : `${guessed} rows had no category, so one was chosen from each product name. Check them before submitting.`)

  let requestId: string | null = null
  let requestNumber: string | null = null
  if (valid.length) {
    const r = await prisma.$transaction(
      async (tx) => {
        const number = await nextRequestNumber(tx, "STOCK_MASTER")
        const req = await tx.request.create({
          data: { number, type: "STOCK_MASTER", title: `Stock master upload: ${fileName}`, createdById: user.id },
        })
        const catCache = new Map<string, string>()
        for (const it of valid) {
          const categoryId = await ensureCategory(tx, it.category, catCache)
          const code = it.code ?? (await nextStockCode(tx))
          await tx.stockItem.create({
            data: {
              code,
              name: it.name,
              product: it.product,
              categoryId,
              size: it.size,
              color: it.color,
              brand: it.brand,
              unit: it.unit,
              openingQty: it.openingQty,
              location: it.location,
              unitCost: it.unitCost ?? undefined,
              reorderLevel: it.reorderLevel,
              status: "DRAFT",
              createdById: user.id,
              requestId: req.id,
            },
          })
        }
        await recomputeTotals(tx, req.id)
        await audit(tx, { actorId: user.id, action: "STOCK.UPLOAD", entity: "Request", entityId: req.id, summary: `Uploaded ${valid.length} stock items from ${fileName} as draft ${number}` })
        return req
      },
      { timeout: 120_000 },
    )
    requestId = r.id
    requestNumber = r.number
  }
  const batch = await finishBatch("STOCK_MASTER", fileName, sheet.rows.length, valid.length, errors, user)
  if (requestId) await prisma.request.update({ where: { id: requestId }, data: { uploadBatchId: batch.id } })
  return { batchId: batch.id, requestId, requestNumber, total: sheet.rows.length, valid: valid.length, errorRows: batch.errorRows, errors: errors.slice(0, 200), warnings }
}

// ---------- Distribution / Receipt ----------

export async function importLines(kind: "distribution" | "receipt", buf: ArrayBuffer, fileName: string, user: SessionUser, meta: { title?: string; purpose?: string }): Promise<ImportResult> {
  const aliases = kind === "distribution" ? DIST_ALIASES : RECEIPT_ALIASES
  const sheet = await readSheet(buf, aliases, kind === "distribution" ? [/recipient/i, /distribution/i] : [/procure/i, /receipt/i, /inward/i])
  const present = presentFields(sheet, aliases)
  if (!present.has("code") && !present.has("itemName"))
    throw new AppError("The file needs a Stock Code or Product Details column to identify items.")
  const need = kind === "distribution" ? ["date", "recipientName"] : ["date", "quantity"]
  const missing = need.filter((f) => !present.has(f))
  if (missing.length) throw new AppError(`The file is missing required columns: ${missing.map((m) => aliases[m][0]).join(", ")}.`)
  if (sheet.rows.length > MAX_ROWS) throw new AppError(`This file has ${sheet.rows.length} rows. The limit is ${MAX_ROWS.toLocaleString()} per upload.`)
  if (!sheet.rows.length) throw new AppError("The sheet has a header row but no data rows.")

  const qtyDefaulted = kind === "distribution" && !present.has("quantity")
  const { byCode, byName } = await itemIndex()
  const errors: RowError[] = []
  const warnings: string[] = []
  if (qtyDefaulted) warnings.push("No Quantity column was found, so each row was counted as 1 unit (the legacy Recipient sheet layout).")

  const now = new Date()
  type Line = { stockItemId: string; quantity: number; date: Date; recipientId?: string | null; recipientName?: string; location?: string | null; purpose?: string | null; poc?: string | null; remarks?: string | null }
  const lines: Line[] = []
  for (const { rowNumber: r, values: v } of sheet.rows) {
    const before = errors.length
    const code = toStr(v.code)
    const itemName = toStr(v.itemName)
    const item = (code && byCode.get(code.toLowerCase())) || (itemName && byName.get(normKey(itemName))) || null
    if (!code && !itemName) err(errors, r, "Stock Code", "Stock code or product details is required")
    else if (!item) err(errors, r, code ? "Stock Code" : "Product Details", "No active stock item matches this value", code ?? itemName)
    const q = qtyDefaulted ? 1 : toInt(v.quantity)
    if (q === null) err(errors, r, "Quantity", "Quantity is required")
    else if (Number.isNaN(q) || q <= 0) err(errors, r, "Quantity", "Must be a whole number greater than 0", v.quantity)
    const d = toDate(v.date)
    if (d === null) err(errors, r, "Date", "Date is required")
    else if (d === "invalid") err(errors, r, "Date", "Use a date like 25-10-2026", v.date)
    else if (d.getTime() > now.getTime() + 86400_000) err(errors, r, "Date", "Date can't be in the future", v.date)
    const recipientName = toStr(v.recipientName)
    if (kind === "distribution" && !recipientName) err(errors, r, "Recipient Name", "Recipient name is required")
    if (errors.length > before) continue
    lines.push({
      stockItemId: item!.id,
      quantity: q as number,
      date: d as Date,
      recipientId: toStr(v.recipientId),
      recipientName: recipientName ?? undefined,
      location: toStr(v.location),
      purpose: toStr(v.purpose) ?? meta.purpose ?? null,
      poc: toStr(v.poc),
      remarks: toStr(v.remarks),
    })
  }

  if (kind === "distribution" && lines.length) {
    const need = new Map<string, number>()
    for (const l of lines) need.set(l.stockItemId, (need.get(l.stockItemId) ?? 0) + l.quantity)
    const all = [...byCode.values()]
    const short = all.filter((i) => (need.get(i.id) ?? 0) > i.availableQty)
    if (short.length)
      warnings.push(`${short.length} item${short.length > 1 ? "s" : ""} would go below zero (for example ${short[0].code} needs ${need.get(short[0].id)}, ${short[0].availableQty} available). Fix the quantities before submitting.`)
  }

  let requestId: string | null = null
  let requestNumber: string | null = null
  if (lines.length) {
    const type = kind === "distribution" ? "DISTRIBUTION" : "RECEIPT"
    const req = await prisma.$transaction(
      async (tx) => {
        const number = await nextRequestNumber(tx, type)
        const req = await tx.request.create({
          data: { number, type, title: meta.title?.trim() || `${kind === "distribution" ? "Distribution" : "Stock inward"} upload: ${fileName}`, purpose: meta.purpose || null, createdById: user.id },
        })
        for (let i = 0; i < lines.length; i += 5000) {
          const chunk = lines.slice(i, i + 5000)
          if (kind === "distribution")
            await tx.distributionLine.createMany({
              data: chunk.map((l) => ({ requestId: req.id, stockItemId: l.stockItemId, quantity: l.quantity, distributedOn: l.date, recipientId: l.recipientId, recipientName: l.recipientName!, location: l.location, purpose: l.purpose, poc: l.poc, remarks: l.remarks })),
            })
          else
            await tx.receiptLine.createMany({
              data: chunk.map((l) => ({ requestId: req.id, stockItemId: l.stockItemId, quantity: l.quantity, receivedOn: l.date, remarks: l.remarks })),
            })
        }
        await recomputeTotals(tx, req.id)
        await audit(tx, { actorId: user.id, action: `${type}.UPLOAD`, entity: "Request", entityId: req.id, summary: `Uploaded ${lines.length} lines from ${fileName} as draft ${number}` })
        return req
      },
      { timeout: 120_000 },
    )
    requestId = req.id
    requestNumber = req.number
  }
  const batch = await finishBatch(kind.toUpperCase(), fileName, sheet.rows.length, lines.length, errors, user)
  if (requestId) await prisma.request.update({ where: { id: requestId }, data: { uploadBatchId: batch.id } })
  return { batchId: batch.id, requestId, requestNumber, total: sheet.rows.length, valid: lines.length, errorRows: batch.errorRows, errors: errors.slice(0, 200), warnings }
}

// ---------- Templates ----------

const TEMPLATE: Record<ImportKind, { columns: { header: string; width: number; required?: boolean; note: string }[]; example: (string | number)[][] }> = {
  stock: {
    columns: [
      { header: "Stock Code", width: 16, note: "Unique code. Leave blank to auto-generate (MAV-00001)." },
      { header: "Stock Name", width: 44, required: true, note: "Full item description, e.g. Mavericks T-Shirt - L - Ash - Crocodile" },
      { header: "Product", width: 24, required: true, note: "Product family, e.g. Mavericks T-Shirt" },
      { header: "Category", width: 16, note: "Apparel, Drinkware, Electronics… Blank = guessed from product." },
      { header: "Size", width: 10, note: "S, M, L, 600 ml… or NA" },
      { header: "Color", width: 10, note: "" },
      { header: "Brand", width: 12, note: "" },
      { header: "Unit of Measure", width: 16, note: "Nos, Pack, Box. Blank = Nos" },
      { header: "Opening Quantity", width: 18, required: true, note: "Whole number, 0 or more" },
      { header: "Location", width: 14, note: "Optional storage location" },
      { header: "Unit Cost", width: 12, note: "Optional, in INR" },
      { header: "Reorder Level", width: 14, note: "Optional low-stock alert threshold" },
    ],
    example: [
      ["", "Mavericks Hoodie - M - Navy - Crocodile", "Mavericks Hoodie", "Apparel", "M", "Navy", "Crocodile", "Nos", 120, "Chennai", 650, 20],
      ["", "Steel Tumbler - 500 ml - Black - NA", "Steel Tumbler", "Drinkware", "500 ml", "Black", "NA", "Nos", 80, "Chennai", "", 10],
    ],
  },
  distribution: {
    columns: [
      { header: "Stock Code", width: 14, note: "Stock code OR Product Details is required" },
      { header: "Product Details", width: 44, note: "Must match the stock name exactly if no code is given" },
      { header: "Quantity", width: 10, required: true, note: "Whole number greater than 0" },
      { header: "Distribution Date", width: 18, required: true, note: "dd-mm-yyyy" },
      { header: "Emp ID", width: 14, note: "Recipient employee ID" },
      { header: "Recipient Name", width: 26, required: true, note: "" },
      { header: "Base Location", width: 14, note: "Chennai, Pune, Mumbai…" },
      { header: "Purpose", width: 24, note: "Onboarding, Event - Design-a-thon, Mavericks Week…" },
      { header: "POC", width: 14, note: "Person handing over the goodies" },
      { header: "Remarks", width: 24, note: "" },
    ],
    example: [
      ["MAV-00005", "", 1, "25-10-2026", "2000150001", "Example Recipient", "Chennai", "Onboarding", "Gokul", ""],
    ],
  },
  receipt: {
    columns: [
      { header: "Stock Code", width: 14, note: "Stock code OR Product Details is required" },
      { header: "Product Details", width: 44, note: "" },
      { header: "Quantity Received", width: 18, required: true, note: "Whole number greater than 0" },
      { header: "Received Date", width: 16, required: true, note: "dd-mm-yyyy" },
      { header: "Remarks", width: 30, note: "Vendor, invoice or PO reference" },
    ],
    example: [["MAV-00005", "", 50, "25-10-2026", "PO 4512, Crocodile"]],
  },
}

export async function templateWorkbook(kind: ImportKind, items: { code: string; name: string; availableQty: number }[]) {
  const t = TEMPLATE[kind]
  const wb = new ExcelJS.Workbook()
  wb.creator = "Mavericks Inventory"
  const ws = wb.addWorksheet(kind === "stock" ? "Stock master" : kind === "distribution" ? "Distribution" : "Stock inward")
  ws.columns = t.columns.map((c) => ({ header: c.header + (c.required ? " *" : ""), width: c.width }))
  styleHeader(ws)
  t.columns.forEach((c, i) => {
    const cell = ws.getRow(1).getCell(i + 1)
    if (c.note) cell.note = c.note
  })
  t.example.forEach((r) => {
    const row = ws.addRow(r)
    row.font = { italic: true, color: { argb: "FF6B7280" } }
  })

  const help = wb.addWorksheet("How to fill")
  help.columns = [{ header: "Column", width: 22 }, { header: "Required", width: 10 }, { header: "What to enter", width: 80 }]
  styleHeader(help)
  t.columns.forEach((c) => help.addRow([c.header, c.required ? "Yes" : "No", c.note]))
  help.addRow([])
  help.addRow(["Notes", "", "Delete the grey example rows before uploading. Up to 50,000 rows per file."])
  help.addRow(["", "", "Valid rows are saved as a draft request; rows with problems are listed in a downloadable error report."])
  if (kind !== "stock") help.addRow(["", "", "Stock only changes after the request is approved."])

  if (kind !== "stock") {
    const ref = wb.addWorksheet("Stock codes")
    ref.columns = [{ header: "Stock Code", width: 14 }, { header: "Product Details", width: 50 }, { header: "Available", width: 12 }]
    styleHeader(ref)
    items.forEach((i) => ref.addRow([i.code, i.name, i.availableQty]))
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}
