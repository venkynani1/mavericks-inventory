/** Sends a browser error to the server log. Never throws. */
export function reportClientError(error: unknown, where: string, extra?: string) {
  try {
    const e = error instanceof Error ? error : new Error(String(error))
    const body = JSON.stringify({ where, message: e.message, stack: e.stack?.split("\n").slice(0, 8).join("\n"), extra, url: location.pathname, ua: navigator.userAgent })
    if (!navigator.sendBeacon?.("/api/client-error", body)) fetch("/api/client-error", { method: "POST", body, keepalive: true }).catch(() => {})
  } catch {}
}
