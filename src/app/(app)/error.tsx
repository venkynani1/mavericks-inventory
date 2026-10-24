"use client"

import { Button } from "@/components/ui/button"

export default function Error({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-2xl font-semibold">This page didn&apos;t load</h1>
      <p className="text-muted-foreground">Something went wrong on the server. Try again; if it keeps happening, share reference {error.digest ?? "—"} with the administrator.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
