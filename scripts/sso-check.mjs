// Checks company sign-in end to end against the mock provider (scripts/mock-oidc.mjs).
//
// 1. node scripts/mock-oidc.mjs
// 2. Start the app (demo data loaded) with:
//      SSO_ISSUER=http://localhost:4400 SSO_CLIENT_ID=mavericks-inventory SSO_CLIENT_SECRET=mock-secret
//      SSO_PROVIDER_NAME="Mock company login" SSO_ALLOWED_EMAIL_DOMAINS=hexaware.example,mavericks.demo
// 3. BASE_URL=http://localhost:3000 node scripts/sso-check.mjs
// 4. Restart the app with SSO_ONLY=true as well, then: BASE_URL=… node scripts/sso-check.mjs --sso-only
import assert from "node:assert/strict"
import { chromium } from "playwright"

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "")
const PROVIDER = process.env.SSO_PROVIDER_NAME || "Mock company login"
const ONLY = process.argv.includes("--sso-only")
const SHOTS = process.env.SCREENSHOTS === "1" ? "docs/screenshots" : null

let passed = 0
const ok = (n) => {
  passed++
  console.log(`  ✓ ${n}`)
}
const browser = await chromium.launch()

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } })
  return ctx.newPage()
}

/** Clicks "Sign in with …", picks a person on the provider page, returns where the app lands. */
async function ssoAs(page, personName) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  await page.getByRole("link", { name: `Sign in with ${PROVIDER}` }).click()
  await page.waitForURL(/localhost:4400\/authorize/)
  await page.getByRole("link", { name: new RegExp(personName) }).click()
  await page.waitForURL((u) => u.origin === BASE, { timeout: 30_000 })
  await page.waitForLoadState("networkidle")
  return new URL(page.url())
}

const whoAmI = async (page) => (await page.getByRole("button", { name: "Account menu" }).innerText()).replace(/\s+/g, " ").trim()

try {
  if (!ONLY) {
    console.log("\nCompany sign-in alongside passwords")
    {
      const p = await fresh()
      await p.goto(`${BASE}/login`, { waitUntil: "networkidle" })
      await p.getByRole("link", { name: `Sign in with ${PROVIDER}` }).waitFor()
      await p.locator("#password").waitFor()
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/38-sign-in-with-sso.png` })
      ok("sign-in page offers company sign-in and the password form")
      await p.getByRole("link", { name: `Sign in with ${PROVIDER}` }).click()
      await p.waitForURL(/localhost:4400\/authorize/)
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/39-identity-provider.png` })
      assert.match(p.url(), /code_challenge_method=S256/)
      assert.match(p.url(), /nonce=/)
      ok("the provider is asked for the code flow with PKCE, state and nonce")
    }
    {
      const p = await fresh()
      const at = await ssoAs(p, "Asha Krishnan")
      assert.equal(at.pathname, "/")
      assert.match(await whoAmI(p), /Asha Krishnan Executive/)
      await p.goto(`${BASE}/distributions/new`, { waitUntil: "networkidle" })
      await p.getByRole("heading", { name: "Record a distribution" }).waitFor()
      ok("a new person with the Executive app role gets an account and can record distributions")
    }
    {
      const p = await fresh()
      await ssoAs(p, "Kavin Raj")
      assert.match(await whoAmI(p), /Kavin Raj Executive/)
      ok("an existing user is matched by email and linked")
    }
    {
      const p = await fresh()
      await ssoAs(p, "Divya Menon")
      assert.match(await whoAmI(p), /Divya Menon Manager/)
      await p.goto(`${BASE}/approvals`, { waitUntil: "networkidle" })
      await p.getByRole("heading", { name: "Approvals" }).waitFor()
      ok("a role changed in the directory is applied at sign-in (Executive → Manager)")
    }
    {
      const p = await fresh()
      const at = await ssoAs(p, "Sam Thomas")
      assert.equal(at.pathname, "/login")
      await p.getByText("You don't have access to Mavericks Inventory yet").waitFor()
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/40-sso-no-access.png` })
      ok("someone with no app role is refused with a clear message")
    }
    {
      const p = await fresh()
      await ssoAs(p, "Outside Partner")
      await p.getByText("Your email domain isn't allowed").waitFor()
      ok("an email outside the allowed domains is refused")
    }
    {
      const p = await fresh()
      await ssoAs(p, "Cancel")
      await p.getByText("Company sign-in was cancelled or refused").waitFor()
      ok("cancelling at the provider returns to sign-in with a message")
    }
    {
      const p = await fresh()
      await p.goto(`${BASE}/api/auth/sso/callback?code=forged&state=forged`)
      await p.getByText("The sign-in took too long").waitFor()
      ok("a callback without the sign-in cookie is rejected")
      await p.goto(`${BASE}/login`, { waitUntil: "networkidle" })
      await p.getByRole("link", { name: `Sign in with ${PROVIDER}` }).click()
      await p.waitForURL(/localhost:4400\/authorize/)
      const href = await p.getByRole("link", { name: /Asha Krishnan/ }).getAttribute("href")
      await p.goto(`http://localhost:4400${href.replace(/state=[^&]*/, "state=tampered")}`)
      await p.getByText("The sign-in couldn't be verified").waitFor()
      ok("a tampered state value is rejected")
    }
    {
      const p = await fresh()
      await p.goto(`${BASE}/login`, { waitUntil: "networkidle" })
      await p.fill("#email", "manager@mavericks.demo")
      await p.fill("#password", process.env.SEED_PASSWORD || "Mavericks@2026")
      await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")])
      ok("password sign-in still works while SSO is optional")
    }
  } else {
    console.log("\nSSO-only mode")
    const p = await fresh()
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" })
    await p.getByRole("link", { name: `Sign in with ${PROVIDER}` }).waitFor()
    assert.equal(await p.locator("#password").count(), 0)
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/41-sso-only-sign-in.png` })
    ok("the password form is hidden")
    await p.getByRole("link", { name: /Administrator sign-in without/ }).click()
    await p.locator("#password").waitFor()
    await p.fill("#email", "executive@mavericks.demo")
    await p.fill("#password", process.env.SEED_PASSWORD || "Mavericks@2026")
    await p.click("button[type=submit]")
    await p.getByText(`Use "Sign in with ${PROVIDER}"`).waitFor()
    ok("non-admins can't use a password")
    await p.fill("#email", "admin@mavericks.demo")
    await p.fill("#password", process.env.SEED_PASSWORD || "Mavericks@2026")
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")])
    ok("an administrator can still sign in with a password (break-glass)")
    const q = await fresh()
    await ssoAs(q, "Ravi Shankar")
    assert.match(await whoAmI(q), /Ravi Shankar Manager/)
    ok("company sign-in works in SSO-only mode")
  }
  console.log(`\nAll ${passed} SSO checks passed.`)
} catch (e) {
  console.error(`\nFAILED after ${passed} passing checks:\n`, e)
  process.exitCode = 1
} finally {
  await browser.close()
}
