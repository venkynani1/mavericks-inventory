// The shared demo accounts created by `npm run db:seed`. On a public demo these stay usable for
// everyone: their password, email, role and status can't be changed from the app.
// Set DEMO_MODE=false to lift the protection (for example after reusing the seed for a pilot).
export const DEMO_EMAILS = [
  "executive@mavericks.demo",
  "executive2@mavericks.demo",
  "manager@mavericks.demo",
  "authority@mavericks.demo",
  "admin@mavericks.demo",
  "employee@mavericks.demo",
]
export const isSharedDemo = (email: string) => process.env.DEMO_MODE !== "false" && DEMO_EMAILS.includes(email.toLowerCase())
