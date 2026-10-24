"use client"

import { useState } from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type PickItem = { id: string; code: string; name: string; available: number }

export function ItemPicker({ items, value, onChange, invalid, id }: { items: PickItem[]; value: string; onChange: (id: string) => void; invalid?: boolean; id?: string }) {
  const [open, setOpen] = useState(false)
  const current = items.find((i) => i.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid || undefined} className="h-9 w-full justify-between bg-card px-2.5 font-normal">
          <span className={cn("truncate", !current && "text-muted-foreground")}>{current ? current.name : "Choose an item"}</span>
          <ChevronsUpDownIcon data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,90vw)] p-0" align="start">
        <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search by name or code" />
          <CommandList>
            <CommandEmpty>No active item matches.</CommandEmpty>
            <CommandGroup>
              {items.map((i) => (
                <CommandItem
                  key={i.id}
                  value={`${i.code} ${i.name}`}
                  disabled={i.available <= 0 && i.id !== value}
                  onSelect={() => {
                    onChange(i.id)
                    setOpen(false)
                  }}
                >
                  <CheckIcon className={cn(i.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{i.name}</span>
                  <span className={cn("num ml-auto shrink-0 text-xs", i.available <= 0 ? "text-rejected" : "text-muted-foreground")}>
                    {i.code} · {i.available} left
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
