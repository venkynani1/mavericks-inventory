"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { MavAvatar } from "./assistant-panel"

// three.js is only downloaded where the mascot appears, after the page is interactive.
const Mav3D = dynamic(() => import("./mav-3d"), { ssr: false, loading: () => null })

function webglOk() {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

/** The 3D gift-box mascot with a speech bubble. Falls back to a flat icon without WebGL. */
export function MavHello({ message, sub, celebrate, className, size = "md", tone = "light" }: { message: string; sub?: string; celebrate?: boolean; className?: string; size?: "sm" | "md" | "lg"; tone?: "light" | "dark" }) {
  const [gl, setGl] = useState<boolean | null>(null)
  useEffect(() => {
    setGl(webglOk())
  }, [])
  const box = size === "lg" ? "size-56 sm:size-64" : size === "sm" ? "size-28" : "size-40 sm:size-44"
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("relative shrink-0", box)}>
        {gl ? <Mav3D celebrate={celebrate} className="absolute inset-0" /> : gl === false ? <MavAvatar className="absolute inset-0 m-auto size-20 rounded-2xl" /> : null}
      </div>
      <div
        className={cn(
          "relative max-w-xs rounded-2xl px-4 py-3 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-500",
          tone === "dark" ? "bg-white/10 text-white ring-1 ring-white/15 backdrop-blur" : "border bg-card",
        )}
      >
        <span className={cn("absolute top-1/2 -left-1.5 size-3 -translate-y-1/2 rotate-45", tone === "dark" ? "bg-white/10" : "border-b border-l bg-card")} aria-hidden />
        <p className="font-heading text-lg font-semibold">{message}</p>
        {sub && <p className={cn("mt-0.5 text-sm", tone === "dark" ? "text-white/75" : "text-muted-foreground")}>{sub}</p>}
      </div>
    </div>
  )
}
