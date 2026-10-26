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

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
