import type { Metadata } from "next"
import { requirePermission } from "@/lib/server/session"
import { PageHeader } from "@/components/app/page-header"
import { UploadPanel } from "@/components/app/upload-panel"

export const metadata: Metadata = { title: "Upload stock master" }

export default async function StockUpload() {
  await requirePermission("stock:write")
  return (
    <>
      <PageHeader title="Upload stock master" description="Add many new items at once. Each upload becomes one draft request that a manager approves; the opening quantities go into stock at that point." />
      <UploadPanel kind="stock" />
    </>
  )
}
