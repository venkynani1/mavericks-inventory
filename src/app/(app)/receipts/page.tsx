import type { Metadata } from "next"
import Link from "next/link"
import { PlusIcon, UploadIcon } from "lucide-react"
import { requireUser } from "@/lib/server/session"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/app/page-header"
import { RequestsList, type ListParams } from "@/components/app/requests-list"

export const metadata: Metadata = { title: "Stock inward" }

export default async function Receipts({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireUser()
  return (
    <>
      <PageHeader
        title="Stock inward"
        description="Deliveries that top up existing items. Quantities are added after approval, so the shelf count always matches what was checked in."
        actions={
          user.role === "EXECUTIVE" && (
            <>
              <Button variant="outline" asChild>
                <Link href="/receipts/upload">
                  <UploadIcon data-icon="inline-start" />
                  Upload Excel
                </Link>
              </Button>
              <Button asChild>
                <Link href="/receipts/new">
                  <PlusIcon data-icon="inline-start" />
                  Record stock inward
                </Link>
              </Button>
            </>
          )
        }
      />
      <RequestsList user={user} type="RECEIPT" sp={await searchParams} path="/receipts" emptyHint="Record a delivery when new cartons arrive." />
    </>
  )
}
