import "server-only"

/*
 * A small in-memory cache for data that changes rarely (settings, pick lists). It lives in the
 * server process only, so it can never outlive the database it came from (unlike a cache stored on
 * disk or in the hosting platform). Admin changes clear it straight away on the instance that made
 * them; other instances pick the change up within `ttlMs`.
 */
const store = new Map<string, { at: number; value: Promise<unknown> }>()

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
