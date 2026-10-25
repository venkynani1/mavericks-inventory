import { prisma } from "@/lib/db"
import { buildWorkbook, xlsxResponse } from "@/lib/server/excel"
import { reportPdf } from "@/lib/server/pdf"
import { REPORTS, runReport, type Filters, type ReportKey } from "@/lib/server/reports"
import { audit } from "@/lib/server/audit"
import { getUser } from "@/lib/server/session"
import { can } from "@/lib/roles"
import { forbidden, notFound } from "@/lib/server/api"

export const maxDuration = 120

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const user = await getUser()
  if (!user || !can(user.role, "report:view")) return forbidden()
  const { report } = await params
  if (!REPORTS.some((r) => r.key === report)) return notFound("Report")
  const sp = new URL(req.url).searchParams
  const f: Filters = Object.fromEntries([...sp.entries()].filter(([k, v]) => k !== "format" && v))
  const format = sp.get("format") === "pdf" ? "pdf" : "xlsx"
  const r = await runReport(report as ReportKey, f, format === "pdf" ? 5000 : 100_000)
  await audit(prisma, { actorId: user.id, action: "REPORT.EXPORT", entity: "Report", entityId: report, summary: `Exported ${r.title} as ${format.toUpperCase()} (${r.rows.length} rows)` })
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === "pdf") {
    const filtersLine = Object.entries(f).map(([k, v]) => `${k}: ${v}`).join(", ")
    const buf = reportPdf(r, { filtersLine, generatedBy: user.name })
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${report}-${stamp}.pdf"`, "Cache-Control": "no-store" } })
  }
  const buf = await buildWorkbook([{ name: r.title, columns: r.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 12 })), rows: r.rows }])
  return xlsxResponse(buf, `${report}-${stamp}.xlsx`)
}
