// Finds the database connection strings whatever the host called them.
//
// Vercel's Neon integration sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct), but when a
// database is connected with a custom prefix they become e.g. STORAGE_DATABASE_URL /
// STORAGE_DATABASE_URL_UNPOOLED. Older Vercel Postgres projects use POSTGRES_PRISMA_URL /
// POSTGRES_URL_NON_POOLING. Prisma reads DATABASE_URL and DIRECT_URL, so this fills those in.
//
// Keep in step with the copy in src/lib/db.ts.

const isPg = (v) => typeof v === "string" && /^postgres(ql)?:\/\//i.test(v.trim())

/** First value that is a postgres URL, trying exact names, then the same names with any prefix. */
function pick(env, names) {
  for (const n of names) if (isPg(env[n])) return env[n].trim()
  for (const n of names) {
    const key = Object.keys(env).find((k) => k.endsWith(`_${n}`) && isPg(env[k]))
    if (key) return env[key].trim()
  }
  return ""
}

export function applyDatabaseEnvDefaults(env = process.env) {
  // Only fill in names when a real address was found, so error messages show the host's own settings.
  const pooled = isPg(env.DATABASE_URL) ? env.DATABASE_URL : pick(env, ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"])
  if (pooled) env.DATABASE_URL = pooled
  const direct = isPg(env.DIRECT_URL) ? env.DIRECT_URL : pick(env, ["DIRECT_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"]) || pooled
  if (direct) env.DIRECT_URL = direct
  return env
}

/** Names (never values) of settings that look database-related, for error messages. */
export function databaseLikeSettingNames(env = process.env) {
  return Object.keys(env)
    .filter((k) => /DATABASE|POSTGRES|^PG|NEON|DIRECT_URL/i.test(k))
    .sort()
}
