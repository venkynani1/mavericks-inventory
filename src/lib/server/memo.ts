import "server-only"

/*
 * A small in-memory cache for data that changes rarely (settings, pick lists). It lives in the
 * server process only, so it can never outlive the database it came from (unlike a cache stored on
 * disk or in the hosting platform). Admin changes clear it straight away on the instance that made
 * them; other instances pick the change up within `ttlMs`.
 */
// Kept on globalThis: Next.js can load this module more than once in one process (pages and server
// actions are bundled separately), and an admin's change must clear the copy that pages read.
type Entry = { at: number; value: Promise<unknown> }
const g = globalThis as typeof globalThis & { __miMemo?: Map<string, Entry> }
const store: Map<string, Entry> = (g.__miMemo ??= new Map())

export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>
  const value = load().catch((e) => {
    store.delete(key)
    throw e
  })
  store.set(key, { at: Date.now(), value })
  return value
}

export function forget(key: string) {
  store.delete(key)
}
