import { cn } from "@/lib/utils"

export type ReqStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED"

const MAP: Record<ReqStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-draft-soft text-draft" },
  SUBMITTED: { label: "In review", cls: "bg-pending-soft text-pending" },
  APPROVED: { label: "Approved", cls: "bg-approved-soft text-approved" },
  REJECTED: { label: "Rejected", cls: "bg-rejected-soft text-rejected" },
  CANCELLED: { label: "Deleted", cls: "bg-muted text-muted-foreground line-through" },
}

export function StatusBadge({ status, level, required, className }: { status: ReqStatus; level?: number; required?: number; className?: string }) {
  const m = MAP[status]
  const label = status === "SUBMITTED" && required && required > 1 ? `In review, level ${(level ?? 0) + 1} of ${required}` : m.label
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", m.cls, className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  )
}

const TYPE: Record<string, string> = { STOCK_MASTER: "New stock items", RECEIPT: "Stock inward", DISTRIBUTION: "Distribution", STOCK_COUNT: "Stock count" }
export const typeLabel = (t: string) => TYPE[t] ?? t

export function ItemStateBadge({ available, reorder, status }: { available: number; reorder: number; status?: string }) {
  if (status === "DRAFT") return <span className="inline-flex h-6 items-center rounded-full bg-draft-soft px-2.5 text-xs font-medium text-draft">Awaiting approval</span>
  if (available <= 0) return <span className="inline-flex h-6 items-center rounded-full bg-rejected-soft px-2.5 text-xs font-medium text-rejected">Out of stock</span>
  if (available <= reorder) return <span className="inline-flex h-6 items-center rounded-full bg-pending-soft px-2.5 text-xs font-medium text-pending">Low stock</span>
  return <span className="inline-flex h-6 items-center rounded-full bg-approved-soft px-2.5 text-xs font-medium text-approved">In stock</span>
}
