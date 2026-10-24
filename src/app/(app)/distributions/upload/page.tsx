import type { Metadata } from "next"
import { requirePermission } from "@/lib/server/session"
import { getLookups } from "@/lib/server/lookups"
import { PageHeader } from "@/components/app/page-header"
import { UploadPanel } from "@/components/app/upload-panel"

export const metadata: Metadata = { title: "Upload distributions" }

export default async function DistUpload() {
  await requirePermission("stock:write")
  const { purposes } = await getLookups()
  return (
    <>
      <PageHeader title="Upload distributions" description="Bring a whole event's handovers in at once. Rows are matched to stock by code or by the exact Product Details text." />
      <UploadPanel kind="distribution" purposes={purposes} />
    </>
  )
}
