/**
 * Production setup: creates the reference lists and default approval rules, with no demo data.
 * Run once after the first deploy:  npm run db:setup
 * Then sign in with BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD to create the first administrator.
 */
import { PrismaClient } from "@prisma/client"
import { ensureBaseData } from "./base-data"

const prisma = new PrismaClient()

ensureBaseData(prisma)
  .then(async () => {
    const users = await prisma.user.count()
    console.log("Reference data is in place (categories, purposes, locations, units, approval rules).")
    console.log(users ? `${users} user account(s) already exist.` : "No users yet: sign in with BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create the first administrator.")
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
