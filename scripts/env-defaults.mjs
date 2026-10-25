// Lets the app use whatever database settings the host provides.
// Vercel's Neon integration sets DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct);
// older Vercel Postgres projects set POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING.
// Shared by the build script (plain Node) and the app (src/lib/db.ts).
export function applyDatabaseEnvDefaults(env = process.env) {
  env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || ""
  env.DIRECT_URL ||= env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL || ""
  return env
}
