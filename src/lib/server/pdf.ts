import "server-only"
import { jsPDF } from "jspdf"
import { autoTable } from "jspdf-autotable"
import type { ReportResult } from "./reports"

/** A4 landscape report with a branded header, filter line and page numbers. */
export function reportPdf(r: ReportResult, opts: { filtersLine?: string; generatedBy: string }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true })
  const W = doc.internal.pageSize.getWidth()
  const ink: [number, number, number] = [18, 27, 46]
  const blue: [number, number, number] = [35, 80, 168]

  const header = () => {
    doc.setFillColor(...blue)
    doc.rect(0, 0, W, 6, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(15)
    doc.setTextColor(...ink)
    doc.text(r.title, 36, 38)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(91, 101, 119)
    doc.text("Mavericks Inventory", W - 36, 38, { align: "right" })
    const generated = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date())
    doc.text(`Generated ${generated} IST by ${opts.generatedBy}${opts.filtersLine ? `  ·  ${opts.filtersLine}` : ""}`, 36, 54)
  }

  let startY = 66
  header()
  if (r.summary?.length) {
    doc.setFontSize(9)
    let x = 36
    for (const s of r.summary) {
      doc.setTextColor(91, 101, 119)
      doc.text(s.label, x, startY + 4)
      doc.setTextColor(...ink)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      doc.text(s.value, x, startY + 20)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      x += 150
    }
    startY += 34
  }

  autoTable(doc, {
    startY,
    head: [r.columns.map((c) => c.header)],
    body: r.rows.map((row) => r.columns.map((c) => (row[c.key] ?? "") as string | number)),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 3.5, textColor: ink, lineColor: [220, 226, 235], lineWidth: 0.4 },
    headStyles: { fillColor: [233, 238, 246], textColor: ink, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 252] },
    columnStyles: Object.fromEntries(r.columns.map((c, i) => [i, c.align === "right" ? { halign: "right" as const } : {}])),
    margin: { left: 36, right: 36, top: 66 },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) header()
      doc.setFontSize(8)
      doc.setTextColor(140, 148, 160)
      doc.text(`Page ${d.pageNumber}`, W - 36, doc.internal.pageSize.getHeight() - 20, { align: "right" })
      doc.text(`${r.total} rows`, 36, doc.internal.pageSize.getHeight() - 20)
    },
  })
  return Buffer.from(doc.output("arraybuffer"))
}
