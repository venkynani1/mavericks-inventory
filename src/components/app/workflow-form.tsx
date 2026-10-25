"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { saveSettings } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type S = { approvalLevels: 1 | 2; level2Threshold: number; preventNegativeStock: boolean; escalationHours: number }

export function WorkflowForm({ initial }: { initial: S }) {
  const [v, setV] = useState(initial)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await saveSettings(v)
          if (!r.ok) return void toast.error(r.error)
          toast.success(r.message)
          router.refresh()
        })
      }}
    >
      <FieldSet>
        <FieldLegend>Approval levels</FieldLegend>
        <FieldDescription>Level 1 is a Manager or Management Authority. Level 2 is always a Management Authority, and never the same person as level 1.</FieldDescription>
        <ToggleGroup type="single" variant="outline" value={String(v.approvalLevels)} onValueChange={(x) => x && setV({ ...v, approvalLevels: Number(x) as 1 | 2 })} className="w-fit">
          <ToggleGroupItem value="1" className="px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">One level</ToggleGroupItem>
          <ToggleGroupItem value="2" className="px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Two levels</ToggleGroupItem>
        </ToggleGroup>
        {v.approvalLevels === 2 && (
          <Field className="max-w-sm">
            <FieldLabel htmlFor="th">Require level 2 from this many units</FieldLabel>
            <Input id="th" type="number" min={0} className="num" value={v.level2Threshold} onChange={(e) => setV({ ...v, level2Threshold: Number(e.target.value) })} />
            <FieldDescription>Requests below this total need only level 1. Use 0 to send every request to level 2.</FieldDescription>
          </Field>
        )}
      </FieldSet>

      <FieldGroup>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="neg">Block distributions that exceed available stock</FieldLabel>
            <FieldDescription>Checked on submit and again at final approval. Turning it off lets stock go below zero, so keep it on unless you&apos;re entering old records.</FieldDescription>
          </FieldContent>
          <Switch id="neg" checked={v.preventNegativeStock} onCheckedChange={(c) => setV({ ...v, preventNegativeStock: c })} />
        </Field>
        <Field className="max-w-sm">
          <FieldLabel htmlFor="esc">Flag requests waiting longer than (hours)</FieldLabel>
          <Input id="esc" type="number" min={1} max={720} className="num" value={v.escalationHours} onChange={(e) => setV({ ...v, escalationHours: Number(e.target.value) })} />
          <FieldDescription>Overdue requests are highlighted on the dashboard, the approval queue and the Pending Approval report.</FieldDescription>
        </Field>
      </FieldGroup>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Save rules
        </Button>
      </div>
    </form>
  )
}
