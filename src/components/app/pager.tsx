import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fmtNum } from "@/lib/utils"

export function Pager({ page, pageSize, total, params, path }: { page: number; pageSize: number; total: number; params: Record<string, string | undefined>; path: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])
    if (p > 1) sp.set("page", String(p))
    else sp.delete("page")
    return `${path}${sp.size ? `?${sp}` : ""}`
  }
  const from = total ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground">
      <span className="num">
        {fmtNum(from)}–{fmtNum(to)} of {fmtNum(total)}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
            {page > 1 ? (
              <Link href={href(page - 1)}>
                <ChevronLeftIcon data-icon="inline-start" />
                Previous
              </Link>
            ) : (
              <span>
                <ChevronLeftIcon data-icon="inline-start" />
                Previous
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
            {page < pages ? (
              <Link href={href(page + 1)}>
                Next
                <ChevronRightIcon data-icon="inline-end" />
              </Link>
            ) : (
              <span>
                Next
                <ChevronRightIcon data-icon="inline-end" />
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
