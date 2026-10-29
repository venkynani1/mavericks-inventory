"use client"

import { SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openAssistant } from "./topbar"

export function AskMavButton({ label = "Ask Mav" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={openAssistant}>
      <SparklesIcon data-icon="inline-start" />
      {label}
    </Button>
  )
}
