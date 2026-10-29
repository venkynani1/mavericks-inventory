import { UserRoundXIcon } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export function PortalUnlinked() {
  return (
    <Empty className="rounded-xl border bg-card py-20">
      <EmptyHeader>
        <EmptyMedia variant="icon"><UserRoundXIcon /></EmptyMedia>
        <EmptyTitle>Your account isn&apos;t linked to an employee record yet</EmptyTitle>
        <EmptyDescription>Ask the Mavericks engagement team to link it. Your points and goodies will appear here straight away.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
