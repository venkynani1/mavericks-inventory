import type { Metadata } from "next"
import { requireUser } from "@/lib/server/session"
import { PageHeader } from "@/components/app/page-header"
import { RequestsList, type ListParams } from "@/components/app/requests-list"

export const metadata: Metadata = { title: "Requests" }

export default async function Requests({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await requireUser()
  return (
    <>
      <PageHeader title={user.role === "EXECUTIVE" ? "My requests" : "All requests"} description="New stock items, stock inward and distributions in one place, with where each one stands." />
      <RequestsList user={user} sp={await searchParams} path="/requests" emptyHint="Requests you create appear here." />
    </>
  )
}
