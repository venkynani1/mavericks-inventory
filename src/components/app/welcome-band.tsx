"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { XIcon } from "lucide-react"

const Mav3D = dynamic(() => import("./mav-3d"), { ssr: false, loading: () => null })

/** A friendly 3D hello on the home page. Dismissable; remembered for the day in this browser. */
export function WelcomeBand({ name, line, children }: { name: string; line: string; children?: React.ReactNode }) {
  const key = `mav-hello-${new Date().toISOString().slice(0, 10)}`
  const [hidden, setHidden] = useState(false)
  const [gl, setGl] = useState(false)
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1")
    } catch {}
    try {
      const c = document.createElement("canvas")
      setGl(!!(c.getContext("webgl2") || c.getContext("webgl")))
    } catch {}
  }, [key])
  if (hidden) return null
  return (
    <section className="relative mb-5 overflow-hidden rounded-2xl bg-shell text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_18rem_at_90%_-30%,rgba(91,143,217,.45),transparent),radial-gradient(26rem_14rem_at_0%_130%,rgba(241,183,59,.22),transparent)]" />
      <button
        type="button"
        aria-label="Hide the welcome banner for today"
        onClick={() => {
          setHidden(true)
          try {
            localStorage.setItem(key, "1")
          } catch {}
        }}
        className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
      >
        <XIcon className="size-4" />
      </button>
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center md:px-7">
        <div className="relative hidden size-28 shrink-0 sm:block">{gl && <Mav3D className="absolute inset-0" />}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-heading text-2xl font-semibold">Hi {name.split(" ")[0]}!</p>
          <p className="text-sm text-white/75">{line}</p>
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </section>
  )
}
