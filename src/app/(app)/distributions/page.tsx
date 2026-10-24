import type { Metadata } from "next"
import Link from "next/link"
import { PlusIcon, UploadIcon } from "lucide-react"
import { requireUser } from "@/lib/server/session"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/app/page-header"
import { RequestsList, type ListParams } from "@/components/app/requests-list"

export const metadata: Metadata = { title: "Distributions" }

export default async function Distributions({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireUser()
  return (
    <>
      <PageHeader
        title="Distributions"
        description="Goodies handed to employees, interns and event participants. Each request is approved before stock is deducted."
        actions={
          user.role === "EXECUTIVE" && (
            <>
              <Button variant="outline" asChild>
                <Link href="/distributions/upload">
                  <UploadIcon data-icon="inline-start" />
                  Upload Excel
                </Link>
              </Button>
              <Button asChild>
                <Link href="/distributions/new">
                  <PlusIcon data-icon="inline-start" />
                  Record a distribution
                </Link>
              </Button>
            </>
          )
        }
      />
      <RequestsList user={user} type="DISTRIBUTION" sp={await searchParams} path="/distributions" emptyHint="Record a handover or upload your recipient sheet to create the first request." />
    </>
  )
}
