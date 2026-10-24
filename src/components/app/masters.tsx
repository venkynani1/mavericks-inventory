"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { addCategory, addLookup, toggleCategory, toggleLookup } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Panel, PanelHeader } from "./page-header"

type Row = { id: string; label: string; active: boolean; meta?: string }

export function MasterList({ title, description, rows, kind }: { title: string; description: string; rows: Row[]; kind: "CATEGORY" | "LOCATION" | "PURPOSE" | "UNIT" }) {
  const [value, setValue] = useState("")
  const [pending, start] = useTransition()
  const router = useRouter()
  const add = () =>
    start(async () => {
      const r = kind === "CATEGORY" ? await addCategory(value) : await addLookup(kind, value)
      if (!r.ok) return void toast.error(r.error)
      setValue("")
      router.refresh()
    })
  return (
    <Panel>
      <PanelHeader title={title} description={description} />
      <form
        className="flex gap-2 border-b px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`New ${title.toLowerCase().replace(/s$/, "")}`} aria-label={`New ${title}`} className="h-9" />
        <Button type="submit" variant="outline" disabled={pending || !value.trim()}>
          <PlusIcon data-icon="inline-start" />
          Add
        </Button>
      </form>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <span className={r.active ? "" : "text-muted-foreground line-through"}>{r.label}</span>
            {r.meta && <span className="text-xs text-muted-foreground">{r.meta}</span>}
            <Switch
              className="ml-auto"
              aria-label={`${r.active ? "Disable" : "Enable"} ${r.label}`}
              checked={r.active}
              onCheckedChange={(c) =>
                start(async () => {
                  const res = kind === "CATEGORY" ? await toggleCategory(r.id, c) : await toggleLookup(r.id, c)
                  if (!res.ok) toast.error(res.error)
                  router.refresh()
                })
              }
            />
          </li>
        ))}
      </ul>
    </Panel>
  )
}
