"use client"

import { useEffect } from "react"
import { reportClientError } from "./error-report"

/** Reports browser errors that happen outside React rendering (event handlers, timers, promises). */
export function ErrorListener() {
  useEffect(() => {
    let sent = 0
    const onError = (e: ErrorEvent) => sent++ < 5 && reportClientError(e.error ?? e.message, "window.onerror", `${e.filename}:${e.lineno}:${e.colno}`)
    const onRejection = (e: PromiseRejectionEvent) => sent++ < 5 && reportClientError(e.reason, "unhandledrejection")
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
  return null
}
