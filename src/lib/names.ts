/** Name checks for goodies collected at the QR desk. */
export function normName(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1)
}
/** Loose match: at least one name word in common (people type "Priya S" for "Priyanka Sharma"). */
export function namesMatch(entered: string, official: string) {
  const a = normName(entered)
  const b = normName(official)
  return a.some((w) => b.some((x) => x === w || (w.length >= 3 && x.startsWith(w)) || (x.length >= 3 && w.startsWith(x))))
}
