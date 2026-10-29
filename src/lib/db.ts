import { PrismaClient } from "@prisma/client"

// Accept whatever the host named the database settings (same rules as scripts/env-defaults.mjs):
// DATABASE_URL / DATABASE_URL_UNPOOLED from Vercel's Neon integration, the same with a custom
// prefix (e.g. STORAGE_DATABASE_URL), or the older POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING.
const isPg = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//i.test(v.trim())
function pick(names: string[]) {
  for (const n of names) if (isPg(process.env[n])) return process.env[n]!.trim()
  for (const n of names) {
    const key = Object.keys(process.env).find((k) => k.endsWith(`_${n}`) && isPg(process.env[k]))
    if (key) return process.env[key]!.trim()
  }
  return ""
}
if (!isPg(process.env.DATABASE_URL)) process.env.DATABASE_URL = pick(["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"])
if (!isPg(process.env.DIRECT_URL))
  process.env.DIRECT_URL = pick(["DIRECT_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"]) || process.env.DATABASE_URL

// Pages run several queries side by side. Prisma's default pool is (CPUs x 2 + 1), which is only 3 to 5
// connections on a small serverless function, so parallel queries would queue and each wait adds a
// full round trip to the database. Allow 10 unless the address already says otherwise. Use the
// provider's pooled address (Neon "-pooler", RDS Proxy, PgBouncer) so this stays cheap.
if (process.env.DATABASE_URL && !/[?&]connection_limit=/.test(process.env.DATABASE_URL))
  process.env.DATABASE_URL += `${process.env.DATABASE_URL.includes("?") ? "&" : "?"}connection_limit=${process.env.DB_POOL_SIZE || 10}`

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
