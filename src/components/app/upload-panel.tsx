"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { CheckCircle2Icon, DownloadIcon, FileSpreadsheetIcon, TriangleAlertIcon, UploadCloudIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, fmtNum } from "@/lib/utils"
import { Panel } from "./page-header"

type Result = {
  batchId: string
  requestId: string | null
  requestNumber: string | null
  total: number
  valid: number
  errorRows: number
  errors: { row: number; field: string; value?: string; message: string }[]
  warnings: string[]
}

const COPY = {
  stock: { noun: "stock items", template: "stock master template", legacy: "Your old “Stock count” sheet also works: Product Details, Product, Size, Color, Brand and Available are recognised." },
  distribution: { noun: "distribution lines", template: "distribution template", legacy: "Your old “Recipient” sheet also works as-is: Date of Delivery, Emp ID, Name, Base Location, Category, POC and Product Details are recognised, one unit per row." },
  receipt: { noun: "inward lines", template: "stock inward template", legacy: "The old “Procurement” sheet layout (Date, Product Details, Procured) is recognised too." },
}

export function UploadPanel({ kind, purposes = [] }: { kind: "stock" | "distribution" | "receipt"; purposes?: string[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [title, setTitle] = useState("")
  const [purpose, setPurpose] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const c = COPY[kind]

  const pick = (f: File | undefined | null) => {
    setError(null)
    setResult(null)
    if (!f) return
    if (!/\.xlsx$/i.test(f.name)) {
      setError("Choose an .xlsx file. Save .xls or .csv files as Excel Workbook first.")
      return
    }
    setFile(f)
  }

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (title) fd.append("title", title)
      if (purpose) fd.append("purpose", purpose)
      const res = await fetch(`/api/uploads/${kind}`, { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) setError(json.error ?? "Upload failed.")
      else {
        setResult(json)
        router.refresh()
      }
    } catch {
      setError("The upload didn't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid gap-4 lg:grid-cols-3">
        <Step n={1} title="Get the template" done>
          <p className="text-sm text-muted-foreground">Fill the {c.template}. Required columns are marked with an asterisk; the second sheet explains each column.</p>
          <Button variant="outline" size="sm" className="mt-3 w-fit" asChild>
            <a href={`/api/templates/${kind}`}>
              <DownloadIcon data-icon="inline-start" />
              Download template
            </a>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">{c.legacy}</p>
        </Step>
        <Step n={2} title="Upload your file" done={!!file}>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              pick(e.dataTransfer.files?.[0])
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              drag ? "border-primary bg-accent" : "hover:border-primary/60 hover:bg-muted/50",
            )}
          >
            {file ? <FileSpreadsheetIcon className="size-6 text-approved" /> : <UploadCloudIcon className="size-6 text-muted-foreground" />}
            {file ? (
              <span className="flex flex-col">
                <span className="font-medium break-all">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · choose another file</span>
              </span>
            ) : (
              <span>
                <span className="font-medium text-primary">Choose a file</span> or drop it here
                <span className="block text-xs text-muted-foreground">.xlsx up to 15 MB and 50,000 rows</span>
              </span>
            )}
          </button>
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </Step>
        <Step n={3} title="Check and create the draft" done={!!result}>
          {kind !== "stock" && (
            <FieldGroup className="mb-3 gap-3">
              <Field>
                <FieldLabel htmlFor="title">Request title</FieldLabel>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "distribution" ? "Onboarding batch 21 — welcome kits" : "PO 4512 — Crocodile T-shirts"} />
              </Field>
              {kind === "distribution" && purposes.length > 0 && (
                <Field>
                  <FieldLabel htmlFor="purpose">Default purpose</FieldLabel>
                  <Select value={purpose || "__none"} onValueChange={(v) => setPurpose(v === "__none" ? "" : v)}>
                    <SelectTrigger id="purpose" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__none">Use the purpose in each row</SelectItem>
                        {purposes.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </FieldGroup>
          )}
          <Button onClick={upload} disabled={!file || busy} className="w-fit">
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? "Checking rows…" : "Validate and save as draft"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">Valid rows are saved as a draft request. Nothing changes in stock until it&apos;s submitted and approved.</p>
        </Step>
      </ol>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rejected/30 bg-rejected-soft px-4 py-3 text-sm text-rejected">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <Panel aria-live="polite">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b px-5 py-4">
            <div className="flex items-center gap-2">
              {result.valid ? <CheckCircle2Icon className="size-5 text-approved" /> : <TriangleAlertIcon className="size-5 text-rejected" />}
              <span className="text-[15px] font-semibold">
                {result.valid ? `${fmtNum(result.valid)} of ${fmtNum(result.total)} rows saved as ${c.noun}` : "No rows could be saved"}
              </span>
            </div>
            {result.errorRows > 0 && <span className="num text-sm text-rejected">{fmtNum(result.errorRows)} rows need fixing</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              {result.errorRows > 0 && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/upload-errors/${result.batchId}`}>
                    <DownloadIcon data-icon="inline-start" />
                    Error report
                  </a>
                </Button>
              )}
              {result.requestId && (
                <Button size="sm" asChild>
                  <Link href={`/requests/${result.requestId}`}>Review draft {result.requestNumber}</Link>
                </Button>
              )}
            </div>
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 border-b bg-pending-soft px-5 py-2.5 text-sm text-pending">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              {w}
            </p>
          ))}
          {result.errors.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-24 pl-5">Row</TableHead>
                  <TableHead className="w-40">Column</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="pr-5">Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="num pl-5">{e.row}</TableCell>
                    <TableCell>{e.field}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{e.value ?? "—"}</TableCell>
                    <TableCell className="pr-5 text-rejected">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {result.errors.length < result.errorRows && <p className="border-t px-5 py-3 text-sm text-muted-foreground">Showing the first {result.errors.length} problems. Download the error report for the full list.</p>}
        </Panel>
      )}
    </div>
  )
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex flex-col rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={cn("num flex size-6 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{n}</span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      {children}
    </li>
  )
}
