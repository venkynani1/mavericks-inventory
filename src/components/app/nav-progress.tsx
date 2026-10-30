"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * A thin bar at the top of the window from the moment a link is clicked until the next page
 * has rendered, so a slow network never feels like a dead click.
 */
export function NavProgress() {
  const pathname = usePathname()
  const search = useSearchParams()
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(false)
  }, [pathname, search])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement)?.closest?.("a")
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return
      const href = a.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || /^https?:/.test(href) || href.startsWith("/api/")) return
      const next = new URL(href, location.href)
      if (next.pathname === location.pathname && next.search === location.search) return
      setActive(true)
    }
    const onSubmitStart = () => setActive(true)
    document.addEventListener("click", onClick, true)
    window.addEventListener("nav:start", onSubmitStart)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("nav:start", onSubmitStart)
    }
  }, [])

  // Never leave the bar stuck if a navigation was cancelled.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setActive(false), 15000)
    return () => clearTimeout(t)
  }, [active])

  if (!active) return null
  return (
    <div role="progressbar" aria-label="Loading page" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div className="nav-progress h-full bg-[#5b8fd9] shadow-[0_0_8px_#5b8fd9]" />
    </div>
  )
}
