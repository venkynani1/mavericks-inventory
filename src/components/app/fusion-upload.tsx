"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { FileSpreadsheetIcon, UploadIcon } from "lucide-react"
import { fusionChunk, fusionFinish, fusionStart } from "@/app/actions/fusion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { fmtNum } from "@/lib/utils"

type Row = { empId: string; name: string; status: string; lwd: string | null; designation: string | null; grade: string | null; location: string | null; department: string | null }
type Summary = { rows: number; active: number; resigned: number; added: number; deactivated: number; reactivated: number; skipped: number }

// Fusion column names, with alternatives in case the report's headings change slightly.
const COLS: Record<keyof Row, string[]> = {
  empId: ["employee id", "emp id", "employee number", "person number"],
  name: ["person name", "employee name", "name", "full name"],
  status: ["dhr status", "status", "employment status", "assignment status"],
  lwd: ["last_working_date", "last working date", "lwd"],
  designation: ["tsr", "designation", "job title"],
  grade: ["grade"],
  location: ["base_location", "base location", "dhr location", "location"],
  department: ["emp owning bu", "business unit", "bu", "department"],
}
const CHUNK = 2500

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase()

function mapRows(sheet: unknown[][]): { rows: Row[]; missing: string[] } {
  const headerAt = sheet.findIndex((r) => r.some((c) => COLS.empId.includes(norm(c))))
  if (headerAt < 0) return { rows: [], missing: ["Employee ID"] }
  const header = sheet[headerAt].map(norm)
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))])) as Record<keyof Row, number>
  const missing = (["empId", "name", "status"] as const).filter((k) => idx[k] < 0).map((k) => ({ empId: "Employee ID", name: "PERSON NAME", status: "DHR Status" })[k])
  if (missing.length) return { rows: [], missing }
  const get = (r: unknown[], k: keyof Row) => (idx[k] >= 0 ? r[idx[k]] : null)
  const rows: Row[] = []
  for (const r of sheet.slice(headerAt + 1)) {
    const id = get(r, "empId")
    if (id === null || id === undefined || String(id).trim() === "") continue
    const lwd = get(r, "lwd")
    rows.push({
      empId: String(id).trim(),
      name: String(get(r, "name") ?? "").trim(),
      status: String(get(r, "status") ?? "").trim(),
      lwd: lwd instanceof Date ? lwd.toISOString() : lwd ? String(lwd) : null,
      designation: get(r, "designation") ? String(get(r, "designation")) : null,
      grade: get(r, "grade") ? String(get(r, "grade")) : null,
      location: get(r, "location") ? String(get(r, "location")) : null,
      department: get(r, "department") ? String(get(r, "department")) : null,
    })
  }
  return { rows, missing: [] }
}

export function FusionUpload() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    setSummary(null)
    try {
      setProgress({ done: 0, total: 0, stage: "Reading the file…" })
      const { readSheet } = await import("read-excel-file/browser")
      const sheet = (await readSheet(file)) as unknown[][]
      const { rows, missing } = mapRows(sheet)
      if (missing.length) throw new Error(`This doesn't look like the Fusion report: no ${missing.join(", ")} column.`)
      if (!rows.length) throw new Error("No employee rows found in the file.")
      const start = await fusionStart(file.name)
      if (!start.ok) throw new Error(start.error)
      const id = (start.data as { id: string }).id
      for (let i = 0; i < rows.length; i += CHUNK) {
        setProgress({ done: i, total: rows.length, stage: "Updating employees…" })
        const r = await fusionChunk(id, rows.slice(i, i + CHUNK))
        if (!r.ok) throw new Error(r.error)
      }
      setProgress({ done: rows.length, total: rows.length, stage: "Finishing…" })
      const done = await fusionFinish(id)
      if (!done.ok) throw new Error(done.error)
      setSummary(done.data as Summary)
      toast.success("Fusion report uploaded")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed. Try again.")
    } finally {
      setBusy(false)
      setProgress(null)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && (setOpen(o), o && (setError(null), setSummary(null)))}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UploadIcon data-icon="inline-start" />
          Upload Fusion report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload this week&apos;s Fusion report</DialogTitle>
          <DialogDescription>
            Choose the Fusion Connect report (.xlsx) exactly as exported. New joiners are added, and everyone is marked active or resigned from the DHR Status column. Only active employees can earn points, order goodies, win prizes or collect goodies. The file is read on your computer; only the employee ID, name, status, last working date, designation, grade, location and BU are sent.
          </DialogDescription>
        </DialogHeader>
        <input ref={input} type="file" accept=".xlsx" className="sr-only" id="fusion-file" aria-label="Fusion report file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {progress ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="flex items-center gap-2 text-sm"><Spinner />{progress.stage}{progress.total > 0 && ` ${fmtNum(progress.done)} of ${fmtNum(progress.total)}`}</p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 5}%` }} />
            </div>
          </div>
        ) : summary ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-4 text-sm" aria-label="Upload summary">
            <dt className="text-muted-foreground">Rows read</dt><dd className="num text-right">{fmtNum(summary.rows)}</dd>
            <dt className="text-muted-foreground">Active</dt><dd className="num text-right font-semibold text-approved">{fmtNum(summary.active)}</dd>
            <dt className="text-muted-foreground">Resigned or inactive</dt><dd className="num text-right">{fmtNum(summary.resigned)}</dd>
            <dt className="text-muted-foreground">New employees added</dt><dd className="num text-right">{fmtNum(summary.added)}</dd>
            <dt className="text-muted-foreground">Newly inactive</dt><dd className="num text-right">{fmtNum(summary.deactivated)}</dd>
            <dt className="text-muted-foreground">Active again</dt><dd className="num text-right">{fmtNum(summary.reactivated)}</dd>
            {summary.skipped > 0 && <><dt className="text-muted-foreground">Rows skipped (no ID or name)</dt><dd className="num text-right">{fmtNum(summary.skipped)}</dd></>}
          </dl>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
            <FileSpreadsheetIcon className="size-8" />
            Choose the Fusion report (.xlsx)
          </button>
        )}
        {error && <p role="alert" className="rounded-lg bg-rejected-soft px-3 py-2 text-sm text-rejected">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{summary ? "Done" : "Cancel"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
