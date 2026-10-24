import type { Metadata } from "next"
import { requirePermission } from "@/lib/server/session"
import { PageHeader } from "@/components/app/page-header"
import { UploadPanel } from "@/components/app/upload-panel"

export const metadata: Metadata = { title: "Upload stock inward" }

export default async function ReceiptUpload() {
  await requirePermission("stock:write")
  return (
    <>
      <PageHeader title="Upload stock inward" description="Record a large delivery from a spreadsheet. Quantities are added after approval." />
      <UploadPanel kind="receipt" />
    </>
  )
}
