"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { createStockItem, updateStockItem, type StockItemInput } from "@/app/actions/stock"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

type Opt = { value: string; label: string }

export function StockItemForm({
  id,
  initial,
  categories,
  units,
  locations,
  quantityLocked,
}: {
  id?: string
  initial?: Partial<StockItemInput>
  categories: Opt[]
  units: string[]
  locations: string[]
  quantityLocked?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState<StockItemInput>({
    code: "",
    name: "",
    product: "",
    categoryId: categories[0]?.value ?? "",
    size: "",
    color: "",
    brand: "",
    unit: units[0] ?? "Nos",
    location: locations[0] ?? "",
    unitCost: "",
    reorderLevel: 0,
    openingQty: 0,
    ...initial,
  })
  const set = <K extends keyof StockItemInput>(k: K, val: StockItemInput[K]) => setV((o) => ({ ...o, [k]: val }))

  // Suggest the legacy-tracker style name "Product - Size - Colour - Brand" until the user types their own.
  const [nameTouched, setNameTouched] = useState(!!initial?.name)
  const suggested = [v.product, v.size || "NA", v.color || "NA", v.brand || "NA"].join(" - ")
  const name = nameTouched ? v.name : v.product ? suggested : ""

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const payload = { ...v, name }
      const res = id ? await updateStockItem(id, payload) : await createStockItem(payload)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(res.message ?? "Saved")
      if (id) router.push(`/stock/${id}`)
      else if (res.data && "requestId" in res.data) router.push(`/requests/${res.data.requestId}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <FieldSet>
        <FieldLegend>What the item is</FieldLegend>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="product">Product</FieldLabel>
            <Input id="product" required value={v.product} onChange={(e) => set("product", e.target.value)} placeholder="Mavericks T-Shirt…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="category">Category</FieldLabel>
            <Select value={v.categoryId} onValueChange={(x) => set("categoryId", x)}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-3 md:col-span-2">
            <Field>
              <FieldLabel htmlFor="size">Size</FieldLabel>
              <Input id="size" value={v.size ?? ""} onChange={(e) => set("size", e.target.value)} placeholder="L, 600 ml…" />
            </Field>
            <Field>
              <FieldLabel htmlFor="color">Colour</FieldLabel>
              <Input id="color" value={v.color ?? ""} onChange={(e) => set("color", e.target.value)} placeholder="Ash…" />
            </Field>
            <Field>
              <FieldLabel htmlFor="brand">Brand</FieldLabel>
              <Input id="brand" value={v.brand ?? ""} onChange={(e) => set("brand", e.target.value)} placeholder="Crocodile…" />
            </Field>
          </div>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="name">Stock name</FieldLabel>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => {
                setNameTouched(true)
                set("name", e.target.value)
              }}
            />
            <FieldDescription>This is the &ldquo;Product Details&rdquo; text used to match rows in Excel uploads. It fills in from the fields above until you edit it.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="code">Stock code</FieldLabel>
            <Input id="code" spellCheck={false} autoComplete="off" value={v.code ?? ""} onChange={(e) => set("code", e.target.value)} placeholder="Leave blank to generate…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="unit">Unit of measure</FieldLabel>
            <Select value={v.unit} onValueChange={(x) => set("unit", x)}>
              <SelectTrigger id="unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {units.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </FieldSet>

      <Separator />

      <FieldSet>
        <FieldLegend>Quantities and storage</FieldLegend>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field data-disabled={quantityLocked || undefined}>
            <FieldLabel htmlFor="openingQty">Opening quantity</FieldLabel>
            <Input id="openingQty" type="number" inputMode="numeric" min={0} step={1} required disabled={quantityLocked} value={String(v.openingQty ?? "")} onChange={(e) => set("openingQty", e.target.value as unknown as number)} className="num" />
            <FieldDescription>{quantityLocked ? "Approved items change quantity only through stock inward or distribution requests." : "Added to stock after the request is approved."}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="reorderLevel">Reorder level</FieldLabel>
            <Input id="reorderLevel" type="number" inputMode="numeric" min={0} step={1} value={String(v.reorderLevel ?? 0)} onChange={(e) => set("reorderLevel", e.target.value as unknown as number)} className="num" />
            <FieldDescription>The item shows as low stock at or below this number.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="location">Location</FieldLabel>
            <Select value={v.location || "__none"} onValueChange={(x) => set("location", x === "__none" ? "" : x)}>
              <SelectTrigger id="location" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__none">Not specified</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="unitCost">Unit cost (₹)</FieldLabel>
            <Input id="unitCost" type="number" inputMode="decimal" min={0} step="0.01" value={String(v.unitCost ?? "")} onChange={(e) => set("unitCost", e.target.value as unknown as number)} className="num" placeholder="Optional" />
          </Field>
        </FieldGroup>
      </FieldSet>

      {error && <p role="alert" className="rounded-lg bg-rejected-soft px-4 py-3 text-sm text-rejected">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {id ? "Save changes" : "Add to draft"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
