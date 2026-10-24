import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-2xl font-semibold">That page doesn&apos;t exist</h1>
      <p className="text-muted-foreground">The item or request may have been removed, or the link is wrong.</p>
      <Button asChild>
        <Link href="/">Go to the overview</Link>
      </Button>
    </div>
  )
}
