"use client"

import { Trash2Icon } from "lucide-react"
import { deleteStockItem } from "@/app/actions/stock"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "./confirm-action"

export function DeleteItemButton({ id, name, draft }: { id: string; name: string; draft: boolean }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="destructive">
          <Trash2Icon data-icon="inline-start" />
          {draft ? "Remove from draft" : "Deactivate"}
        </Button>
      }
      title={draft ? "Remove this item from the draft?" : "Deactivate this item?"}
      description={
        draft
          ? `${name} won't be created when the draft is approved. The removal is kept in the audit log.`
          : `${name} will be hidden from stock lists and can't be used in new requests. It's a logical delete: the record and its audit history stay.`
      }
      confirmLabel={draft ? "Remove item" : "Deactivate item"}
      destructive
      action={() => deleteStockItem(id)}
      redirectTo="/stock"
    />
  )
}
