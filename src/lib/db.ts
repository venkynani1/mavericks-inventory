import { PrismaClient } from "@prisma/client"

// Accept the setting names Vercel's database integrations create (same mapping as scripts/env-defaults.mjs).
process.env.DATABASE_URL ||= process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || ""
process.env.DIRECT_URL ||= process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || ""

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
