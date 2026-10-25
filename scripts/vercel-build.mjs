// Build used on Vercel (`npm run vercel-build`). It prepares the database itself, so nobody
// has to connect to it by hand:
//   1. create or update the tables (only pending migrations run; data is never dropped)
//   2. SEED_DEMO_DATA=true  → load the demo data if the database is empty
//      otherwise            → make sure the standard lists and approval rules exist
//   3. build the site
import { execSync } from "node:child_process"
import { applyDatabaseEnvDefaults } from "./env-defaults.mjs"

applyDatabaseEnvDefaults()
const run = (cmd) => {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { stdio: "inherit", env: process.env })
}

if (!process.env.DATABASE_URL) {
  console.error(
    "\n✖ No database is connected to this project.\n" +
      "  In Vercel: Project → Storage → Create Database → Neon (Serverless Postgres) → Connect, then redeploy.\n" +
      "  Or add DATABASE_URL (and DIRECT_URL) under Settings → Environment Variables.\n",
  )
  process.exit(1)
}
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  console.error(
    "\n✖ AUTH_SECRET is missing or shorter than 32 characters.\n" +
      "  Add it under Settings → Environment Variables (any long random text, e.g. from https://generate-secret.vercel.app/64), then redeploy.\n",
  )
  process.exit(1)
}

run("npx prisma generate")
run("npx prisma migrate deploy")
if (process.env.SEED_DEMO_DATA === "true") run("npx tsx prisma/seed.ts")
else run("npx tsx prisma/setup.ts")
run("npx next build")
