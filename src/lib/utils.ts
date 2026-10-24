import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const numberFmt = new Intl.NumberFormat("en-IN")
export function fmtNum(n: number | null | undefined) {
  return numberFmt.format(n ?? 0)
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
})
export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—"
  return dateFmt.format(new Date(d))
}
export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—"
  return dateTimeFmt.format(new Date(d))
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

/** Normalise a free-text product label for matching legacy sheet rows to stock items. */
export function normKey(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").trim()
}
