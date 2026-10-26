// Build used on Vercel (`npm run vercel-build`). It prepares the database itself, so nobody
// has to connect to it by hand:
//   1. create or update the tables (only pending migrations run; data is never dropped)
//   2. SEED_DEMO_DATA=true  → load the demo data if the database is empty
//      otherwise            → make sure the standard lists and approval rules exist
//   3. build the site
import { execSync } from "node:child_process"
import { applyDatabaseEnvDefaults, databaseLikeSettingNames } from "./env-defaults.mjs"

applyDatabaseEnvDefaults()
const run = (cmd) => {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { stdio: "inherit", env: process.env })
}

const where = process.env.VERCEL_ENV
  ? `This is a ${process.env.VERCEL_ENV.toUpperCase()} build of branch "${process.env.VERCEL_GIT_COMMIT_REF ?? "?"}".`
  : "Not running on Vercel."

if (!/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "")) {
  const seen = databaseLikeSettingNames()
  console.error(
    [
      "",
      "✖ No database is connected to this build.",
      `  ${where}`,
      seen.length
        ? `  Database-related settings this build can see (none holds a postgres:// address): ${seen.join(", ")}`
        : "  This build can't see any database settings at all.",
      "",
      "  Fix (in the Vercel project):",
      "   1. Storage tab → Create Database → Neon → Continue → Create.",
      "      (If you already created it: Storage tab → open the database → Connect Project.)",
      "   2. In Connect Project, choose this project and tick BOTH Production and Preview → Connect.",
      "   3. Deployments → newest deployment → ⋯ → Redeploy.",
      "      Settings only reach deployments started AFTER they were added, so this step is needed.",
      "  Or: Settings → Environment Variables → add DATABASE_URL (and DIRECT_URL) with a postgres:// address.",
      "",
    ].join("\n"),
  )
  process.exit(1)
}
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  console.error(
    `\n✖ AUTH_SECRET is missing or shorter than 32 characters.\n  ${where}\n` +
      "  Add it under Settings → Environment Variables for Production and Preview (any random text of 32+ characters,\n" +
      "  e.g. from https://generate-secret.vercel.app/64), then Deployments → ⋯ → Redeploy.\n",
  )
  process.exit(1)
}

console.log(`✔ Database found. ${where}`)
run("npx prisma generate")
run("npx prisma migrate deploy")
if (process.env.SEED_DEMO_DATA === "true") run("npx tsx prisma/seed.ts")
else run("npx tsx prisma/setup.ts")
run("npx next build")
