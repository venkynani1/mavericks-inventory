import { prisma } from "@/lib/db"
import { buildWorkbook, xlsxResponse } from "@/lib/server/excel"
import { getUser } from "@/lib/server/session"
import { fmtDate } from "@/lib/utils"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Not signed in", { status: 401 })
  const { id } = await params
  const r = await prisma.request.findUnique({ where: { id } })
  if (!r) return new Response("Not found", { status: 404 })
  let sheet
  if (r.type === "DISTRIBUTION") {
    const lines = await prisma.distributionLine.findMany({ where: { requestId: id }, include: { stockItem: true }, orderBy: { createdAt: "asc" } })
    sheet = {
      name: "Lines",
      columns: [
        { header: "Stock Code", key: "code", width: 14 }, { header: "Product Details", key: "name", width: 44 }, { header: "Quantity", key: "qty", width: 10 },
        { header: "Distribution Date", key: "date", width: 16 }, { header: "Emp ID", key: "emp", width: 14 }, { header: "Recipient Name", key: "rec", width: 26 },
        { header: "Base Location", key: "loc", width: 14 }, { header: "Purpose", key: "purpose", width: 22 }, { header: "POC", key: "poc", width: 14 }, { header: "Remarks", key: "remarks", width: 24 },
      ],
      rows: lines.map((l) => ({ code: l.stockItem.code, name: l.stockItem.name, qty: l.quantity, date: fmtDate(l.distributedOn), emp: l.recipientId, rec: l.recipientName, loc: l.location, purpose: l.purpose, poc: l.poc, remarks: l.remarks })),
    }
  } else if (r.type === "RECEIPT") {
    const lines = await prisma.receiptLine.findMany({ where: { requestId: id }, include: { stockItem: true } })
    sheet = {
      name: "Lines",
      columns: [{ header: "Stock Code", key: "code", width: 14 }, { header: "Product Details", key: "name", width: 44 }, { header: "Quantity Received", key: "qty", width: 16 }, { header: "Received Date", key: "date", width: 16 }, { header: "Remarks", key: "remarks", width: 30 }],
      rows: lines.map((l) => ({ code: l.stockItem.code, name: l.stockItem.name, qty: l.quantity, date: fmtDate(l.receivedOn), remarks: l.remarks })),
    }
  } else {
    const items = await prisma.stockItem.findMany({ where: { requestId: id, status: { not: "INACTIVE" } }, include: { category: true } })
    sheet = {
      name: "Items",
      columns: [{ header: "Stock Code", key: "code", width: 14 }, { header: "Stock Name", key: "name", width: 44 }, { header: "Product", key: "product", width: 22 }, { header: "Category", key: "cat", width: 14 }, { header: "Size", key: "size", width: 8 }, { header: "Color", key: "color", width: 10 }, { header: "Brand", key: "brand", width: 12 }, { header: "Opening Quantity", key: "qty", width: 16 }],
      rows: items.map((i) => ({ code: i.code, name: i.name, product: i.product, cat: i.category.name, size: i.size, color: i.color, brand: i.brand, qty: i.openingQty })),
    }
  }
  return xlsxResponse(await buildWorkbook([sheet]), `${r.number}.xlsx`)
}
