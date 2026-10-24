"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckIcon, PencilIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react"
import { approve, deleteDraft, reject, submit, updateRequestMeta } from "@/app/actions/requests"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmAction } from "./confirm-action"

type Res = { ok: true; message?: string; data?: unknown } | { ok: false; error: string }

function RemarksDialog({
  trigger,
  title,
  description,
  label,
  required,
  confirm,
  variant = "default",
  run,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  label: string
  required?: boolean
  confirm: string
  variant?: "default" | "destructive"
  run: (remarks: string) => Promise<Res>
}) {
  const [open, setOpen] = useState(false)
  const [remarks, setRemarks] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setErr(null) }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field data-invalid={!!err || undefined}>
          <FieldLabel htmlFor="remarks">{label}</FieldLabel>
          <Textarea id="remarks" rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} aria-invalid={!!err || undefined} />
          {err && <FieldDescription>{err}</FieldDescription>}
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={variant}
            disabled={pending || (required && !remarks.trim())}
            onClick={() =>
              start(async () => {
                const r = await run(remarks)
                if (!r.ok) return setErr(r.error)
                const d = r.data as { final?: boolean; level?: number } | undefined
                toast.success(r.message ?? (d?.final ? "Approved. Stock is updated." : d?.level ? `Approved at level ${d.level}. Sent to the next approver.` : "Done"))
                setOpen(false)
                setRemarks("")
                router.refresh()
              })
            }
          >
            {pending && <Spinner data-icon="inline-start" />}
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MakerActions({ id, status, title, purpose, remarks, isMaster, lineCount }: { id: string; status: string; title: string; purpose: string | null; remarks: string | null; isMaster: boolean; lineCount: number }) {
  return (
    <>
      <EditDetails id={id} title={title} purpose={purpose} remarks={remarks} />
      {status === "DRAFT" && (
        <ConfirmAction
          trigger={
            <Button variant="ghost">
              <Trash2Icon data-icon="inline-start" />
              Delete draft
            </Button>
          }
          title="Delete this draft?"
          description={isMaster ? "The draft and its new items are marked as deleted. Nothing changes in stock." : "The draft is marked as deleted and can't be submitted. Nothing changes in stock."}
          confirmLabel="Delete draft"
          destructive
          action={() => deleteDraft(id)}
          redirectTo="/requests"
        />
      )}
      <RemarksDialog
        trigger={
          <Button disabled={lineCount === 0}>
            <SendIcon data-icon="inline-start" />
            {status === "REJECTED" ? "Resubmit for approval" : "Submit for approval"}
          </Button>
        }
        title={status === "REJECTED" ? "Resubmit for approval" : "Submit for approval"}
        description="Once submitted you can't edit the request unless an approver returns it."
        label="Note for the approver (optional)"
        confirm={status === "REJECTED" ? "Resubmit" : "Submit"}
        run={(r) => submit(id, r)}
      />
    </>
  )
}

export function ApproverActions({ id, finalLevel, level, required }: { id: string; finalLevel: boolean; level: number; required: number }) {
  return (
    <>
      <RemarksDialog
        trigger={
          <Button variant="destructive">
            <XIcon data-icon="inline-start" />
            Reject
          </Button>
        }
        title="Return this request"
        description="The executive sees your remarks and can correct and resubmit. Stock doesn't change."
        label="What needs to change"
        required
        confirm="Reject request"
        variant="destructive"
        run={(r) => reject(id, r)}
      />
      <RemarksDialog
        trigger={
          <Button>
            <CheckIcon data-icon="inline-start" />
            {finalLevel ? "Approve and update stock" : `Approve level ${level}`}
          </Button>
        }
        title={finalLevel ? "Approve and update stock" : `Approve at level ${level} of ${required}`}
        description={finalLevel ? "This is the final approval. Quantities are posted to stock and the ledger immediately, and can't be undone." : "The request then goes to a Management Authority for the final decision."}
        label="Remarks (optional)"
        confirm="Approve"
        run={(r) => approve(id, r)}
      />
    </>
  )
}

function EditDetails({ id, title, purpose, remarks }: { id: string; title: string; purpose: string | null; remarks: string | null }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ title, purpose: purpose ?? "", remarks: remarks ?? "" })
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon data-icon="inline-start" />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit request details</DialogTitle>
          <DialogDescription>Line items are edited in the table below.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="t">Title</FieldLabel>
            <Input id="t" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p">Purpose or reference</FieldLabel>
            <Input id="p" value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="r">Remarks</FieldLabel>
            <Textarea id="r" rows={3} value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateRequestMeta(id, v)
                if (!r.ok) return void toast.error(r.error)
                toast.success(r.message)
                setOpen(false)
                router.refresh()
              })
            }
          >
            {pending && <Spinner data-icon="inline-start" />}
            Save details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
