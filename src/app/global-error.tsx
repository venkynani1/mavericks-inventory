"use client"

import { useEffect } from "react"
import { reportClientError } from "@/components/app/error-report"

/** Last-resort screen. Shows the actual error so it can be reported, and logs it on the server. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error, "global-error"), [error])
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, color: "#121b2e", background: "#f3f5f8" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong on this page</h1>
        <p style={{ color: "#5b6577", marginBottom: 16 }}>It has been reported. Reload to carry on. If it keeps happening, send this to the administrator:</p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#fff", border: "1px solid #dbe1ea", borderRadius: 8, padding: 12, fontSize: 12 }}>
          {error.message}
          {"\n"}
          {error.stack?.split("\n").slice(0, 6).join("\n")}
          {error.digest ? `\nReference: ${error.digest}` : ""}
        </pre>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={() => reset()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #2350a8", background: "#2350a8", color: "#fff" }}>Try again</button>
          <button onClick={() => location.reload()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #cfd7e3", background: "#fff" }}>Reload</button>
        </div>
      </body>
    </html>
  )
}
