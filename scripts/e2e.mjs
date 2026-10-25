// End-to-end test of every Mavericks Inventory flow, driven through the real UI in a headless browser.
// Runs against a live server whose database was loaded with `npm run db:seed`.
//
//   BASE_URL=http://localhost:3000 npm run e2e                 # test only
//   BASE_URL=http://localhost:3000 SCREENSHOTS=1 npm run e2e   # also refresh docs/screenshots/*.png
//
// Needs Playwright's Chromium: `npx playwright install chromium` (once).
import assert from "node:assert/strict"
import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import ExcelJS from "exceljs"
import { chromium, request as pwRequest } from "playwright"

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "")
const PASSWORD = process.env.SEED_PASSWORD || "Mavericks@2026"
const SHOTS = process.env.SCREENSHOTS === "1" ? "docs/screenshots" : null
// Test runs add a short suffix so names stay unique across repeated runs; screenshot runs (on a fresh seed) use clean names.
// E2E_KEEP_NAMES_UNIQUE=1 keeps suffixes even with screenshots (used when checking a live site that already has data).
const RUN = SHOTS && process.env.E2E_KEEP_NAMES_UNIQUE !== "1" ? "" : Date.now().toString(36).slice(-5)
const tag = (s) => (RUN ? `${s} ${RUN}` : s)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let passed = 0
const ok = (name) => {
  passed++
  console.log(`  ✓ ${name}`)
}
const step = (title) => console.log(`\n${title}`)

const browser = await chromium.launch()
const VIEW = { width: 1366, height: 860 }

async function signIn(email, password = PASSWORD, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? VIEW, colorScheme: opts.dark ? "dark" : "light", acceptDownloads: true })
  const page = await ctx.newPage()
  page.on("pageerror", (e) => console.log(`    page error (${email}): ${e.message}`))
  await page.goto(`${BASE}/login`)
  await page.fill("#email", email)
  await page.fill("#password", password)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click("button[type=submit]")])
  await page.waitForLoadState("networkidle")
  return page
}

async function shot(page, name, { full = false } = {}) {
  if (!SHOTS) return
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}

const go = async (page, path) => {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 90_000 })
  await page.waitForTimeout(300) // let React finish hydrating before the first click
}
const dialog = (page) => page.getByRole("dialog")
const alertDialog = (page) => page.getByRole("alertdialog")

/** Available quantity shown on a stock item's page. */
async function availableOn(page, itemId) {
  await go(page, `/stock/${itemId}`)
  const t = await page.getByText("Available", { exact: true }).locator("xpath=following-sibling::span[1]").innerText()
  return Number(t.replace(/[^0-9-]/g, ""))
}

/** Picks an item in the searchable item picker. */
async function pickItem(page, text) {
  await page.getByRole("combobox").filter({ hasText: "Choose an item" }).first().click()
  await page.keyboard.type(text)
  await page.locator("[cmdk-item]").filter({ hasText: text }).first().click()
}

async function itemIdByName(page, name) {
  await go(page, `/stock?q=${encodeURIComponent(name)}`)
  const href = await page.getByRole("link", { name: new RegExp(name.replace(/[()]/g, "\\$&")) }).first().getAttribute("href")
  return href.split("/").pop()
}

async function submitRequestOnPage(page, confirm = "Submit") {
  await page.getByRole("button", { name: /Submit for approval|Resubmit for approval/ }).click()
  await dialog(page).getByRole("button", { name: confirm, exact: true }).click()
  await page.getByText("In review").first().waitFor({ timeout: 30_000 })
}

async function approveOnPage(page, remarks = "") {
  await page.getByRole("button", { name: /^Approve (and update stock|level \d)$/ }).click()
  if (remarks) await dialog(page).locator("#remarks").fill(remarks)
  await dialog(page).getByRole("button", { name: "Approve", exact: true }).click()
  await dialog(page).waitFor({ state: "detached", timeout: 30_000 })
  await page.waitForLoadState("networkidle")
}

async function writeXlsx(file, sheetName, rows) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  rows.forEach((r) => ws.addRow(r))
  await wb.xlsx.writeFile(file)
}

async function upload(page, path, file) {
  await go(page, path)
  await page.setInputFiles("input[type=file]", file)
  await page.getByRole("button", { name: "Validate and save as draft" }).click()
  await page.getByTestId("upload-result").waitFor({ timeout: 90_000 })
  return page.getByTestId("upload-result").innerText()
}

try {
  // ------------------------------------------------------------------
  step("Sign-in and access control")
  {
    const ctx = await browser.newContext({ viewport: VIEW })
    const page = await ctx.newPage()
    await go(page, "/stock")
    assert.match(page.url(), /\/login\?next=%2Fstock/)
    ok("signed-out visitor is sent to the sign-in page")
    await shot(page, "01-sign-in")
    await page.fill("#email", "executive@mavericks.demo")
    await page.fill("#password", "wrong-password")
    await page.click("button[type=submit]")
    await page.getByText("That email and password don't match.").waitFor()
    ok("wrong password is refused with a clear message")
    await ctx.close()

    const api = await pwRequest.newContext({ baseURL: BASE })
    const res = await api.get("/api/templates/stock")
    assert.equal(res.status(), 401)
    assert.equal((await res.json()).error.code, "UNAUTHENTICATED")
    ok("APIs reject signed-out calls with a structured error")
    const health = await (await api.get("/api/health")).json()
    assert.equal(health.status, "ok")
    ok("health check reports the database as reachable")
    await api.dispose()
  }

  const exec = await signIn("executive@mavericks.demo")
  const manager = await signIn("manager@mavericks.demo")
  const authority = await signIn("authority@mavericks.demo")
  const admin = await signIn("admin@mavericks.demo")

  await go(exec, "/approvals")
  await exec.getByText("That page isn't available for your role").waitFor()
  ok("an executive can't open the approval queue")
  await go(manager, "/stock/new")
  assert.ok(new URL(manager.url()).searchParams.has("denied"))
  ok("a manager can't create stock items")

  // ------------------------------------------------------------------
  step("Overview and stock")
  await go(manager, "/")
  await manager.getByRole("heading", { name: "Overview" }).waitFor()
  await shot(manager, "02-overview")
  await shot(manager, "02b-overview-full", { full: true })
  ok("overview loads with stock figures, charts and size runs")

  await go(exec, "/stock")
  await shot(exec, "03-stock-list")
  await Promise.all([exec.waitForURL(/state=low/, { timeout: 30_000 }), exec.getByRole("link", { name: /^Low/ }).click()])
  ok("stock list filters by low stock and keeps the filter in the address")
  await go(exec, "/distributions")
  await shot(exec, "03b-distributions-list")
  await go(exec, "/receipts")
  await shot(exec, "03c-stock-inward-list")
  ok("distribution and stock inward lists open")
  const speakerId = await itemIdByName(exec, "Bluetooth Speaker")
  await go(exec, `/stock/${speakerId}`)
  await shot(exec, "04-stock-item")
  ok("stock item page shows figures, ledger and recipients")

  // ------------------------------------------------------------------
  step("Distribution: record, approve, stock goes down")
  const speakerBefore = await availableOn(exec, speakerId)
  await go(exec, "/distributions/new")
  await exec.fill("#title", tag("Speaker giveaway"))
  await pickItem(exec, "Bluetooth Speaker")
  await exec.getByLabel("Quantity, line 1").fill("2")
  await exec.getByLabel("Employee ID, line 1").fill("2000555001")
  await exec.getByLabel("Recipient name, line 1").fill("Anitha Suresh")
  await shot(exec, "05-distribution-form")
  await Promise.all([exec.waitForURL(/\/requests\//, { timeout: 90_000 }), exec.getByRole("button", { name: "Submit for approval" }).click()])
  const distUrl = exec.url()
  await exec.getByText("In review").first().waitFor()
  await shot(exec, "06-distribution-submitted")
  ok("executive submits a distribution")
  assert.equal(await exec.getByRole("button", { name: /^Approve/ }).count(), 0)
  ok("the creator gets no approve button on their own request")
  assert.equal(await availableOn(exec, speakerId), speakerBefore)
  ok("stock is unchanged while the request is in review")

  await go(manager, "/approvals")
  await manager.getByText(tag("Speaker giveaway")).waitFor()
  await shot(manager, "07-approval-queue")
  await go(manager, new URL(distUrl).pathname)
  await manager.getByRole("button", { name: "Approve and update stock" }).click()
  await dialog(manager).locator("#remarks").fill("Matches the event list.")
  await shot(manager, "08-approve-dialog")
  await dialog(manager).getByRole("button", { name: "Approve", exact: true }).click()
  await dialog(manager).waitFor({ state: "detached" })
  await go(manager, new URL(distUrl).pathname)
  await manager.getByText("Approved").first().waitFor()
  await shot(manager, "09-distribution-approved")
  assert.equal(await availableOn(manager, speakerId), speakerBefore - 2)
  ok("manager approves and the available quantity drops by exactly 2")

  // ------------------------------------------------------------------
  step("Over-stock protection")
  await go(exec, "/distributions/new")
  await exec.fill("#title", tag("Too many speakers"))
  await pickItem(exec, "Bluetooth Speaker")
  await exec.getByLabel("Quantity, line 1").fill("100000")
  await exec.getByLabel("Recipient name, line 1").fill("Anitha Suresh")
  await exec.getByText("over the available quantity").waitFor()
  assert.ok(await exec.getByRole("button", { name: "Submit for approval" }).isDisabled())
  await shot(exec, "10-over-stock-warning")
  ok("a distribution larger than the shelf can't be submitted")

  // ------------------------------------------------------------------
  step("Rejection and resubmission")
  await go(exec, "/distributions/new")
  await exec.fill("#title", tag("Pens for trainers"))
  await pickItem(exec, "Ball Pen")
  await exec.getByLabel("Quantity, line 1").fill("3")
  await exec.getByLabel("Recipient name, line 1").fill("Training desk")
  await Promise.all([exec.waitForURL(/\/requests\//, { timeout: 90_000 }), exec.getByRole("button", { name: "Submit for approval" }).click()])
  const penUrl = new URL(exec.url()).pathname
  await go(manager, penUrl)
  await manager.getByRole("button", { name: "Reject" }).click()
  assert.ok(await dialog(manager).getByRole("button", { name: "Reject request" }).isDisabled())
  ok("rejecting needs a remark")
  await dialog(manager).locator("#remarks").fill("Add each trainer's name instead of the desk.")
  await shot(manager, "11-reject-dialog")
  await dialog(manager).getByRole("button", { name: "Reject request" }).click()
  await dialog(manager).waitFor({ state: "detached" })
  await go(exec, penUrl)
  await exec.getByText("Add each trainer's name instead of the desk.").first().waitFor()
  await shot(exec, "12-returned-request")
  ok("the executive sees the rejection reason")
  await exec.getByRole("button", { name: "Edit details" }).click()
  await dialog(exec).locator("#t").fill(tag("Pens for trainers (named)"))
  await dialog(exec).getByRole("button", { name: "Save details" }).click()
  await dialog(exec).waitFor({ state: "detached" })
  await exec.getByRole("button", { name: "Edit line" }).first().click()
  await dialog(exec).locator("#ln").fill("Ramesh Kannan")
  await dialog(exec).getByRole("button", { name: "Save line" }).click()
  await dialog(exec).waitFor({ state: "detached" })
  await submitRequestOnPage(exec, "Resubmit")
  ok("the executive corrects the request and resubmits it")
  await go(manager, penUrl)
  await approveOnPage(manager)
  await go(manager, penUrl)
  await manager.getByText("Resubmitted by").waitFor()
  await shot(manager, "13-approval-history", { full: true })
  ok("approval history shows submit, return, resubmit and approval")

  // ------------------------------------------------------------------
  step("New stock item with two-level approval")
  const hoodie = tag("Mavericks Hoodie")
  await go(exec, "/stock/new")
  await exec.fill("#product", hoodie)
  await exec.fill("#size", "M")
  await exec.fill("#color", "Navy")
  await exec.fill("#brand", "Crocodile")
  await exec.fill("#openingQty", "150")
  await exec.fill("#reorderLevel", "20")
  await shot(exec, "14-add-stock-item")
  await Promise.all([exec.waitForURL(/\/requests\//, { timeout: 90_000 }), exec.getByRole("button", { name: "Add to draft" }).click()])
  const masterUrl = new URL(exec.url()).pathname
  await exec.getByText(hoodie).first().waitFor()
  await shot(exec, "15-stock-draft")
  await submitRequestOnPage(exec)
  ok("new item goes into a draft and is submitted (150 units, so two levels)")
  await go(manager, masterUrl)
  await approveOnPage(manager)
  await go(manager, masterUrl)
  await manager.getByText("In review, level 2 of 2").first().waitFor()
  await manager.getByText("Waiting for level 2: a Management Authority").waitFor()
  assert.equal(await manager.getByRole("button", { name: /^Approve/ }).count(), 0)
  ok("after level 1 the request waits for a Management Authority; the manager can't approve level 2")
  await go(authority, masterUrl)
  await shot(authority, "16-level-2-approval")
  await approveOnPage(authority, "Budget approved.")
  const hoodieId = await itemIdByName(authority, hoodie)
  assert.equal(await availableOn(authority, hoodieId), 150)
  ok("Management Authority gives final approval and 150 units go into stock")

  // ------------------------------------------------------------------
  step("Stock inward")
  const tshirtId = await itemIdByName(exec, "Mavericks T-Shirt - XXL - Ash")
  const tBefore = await availableOn(exec, tshirtId)
  await go(exec, `/receipts/new?item=${tshirtId}`)
  await exec.fill("#title", tag("XXL top-up"))
  await exec.fill("#ref", "PO 4588, Crocodile Apparels")
  await exec.getByLabel("Quantity received, line 1").fill("12")
  await shot(exec, "17-stock-inward-form")
  await Promise.all([exec.waitForURL(/\/requests\//, { timeout: 90_000 }), exec.getByRole("button", { name: "Submit for approval" }).click()])
  const rcvUrl = new URL(exec.url()).pathname
  await go(manager, rcvUrl)
  await approveOnPage(manager)
  assert.equal(await availableOn(manager, tshirtId), tBefore + 12)
  ok("approved stock inward adds 12 units")

  // ------------------------------------------------------------------
  step("Excel uploads")
  const dir = tmpdir()
  const tpl = await exec.request.get(`${BASE}/api/templates/stock`)
  assert.equal(tpl.status(), 200)
  assert.match(tpl.headers()["content-type"], /spreadsheetml/)
  ok("stock master template downloads")

  const stockFile = join(dir, `stock-${RUN || "shots"}.xlsx`)
  await writeXlsx(stockFile, "Stock master", [
    ["Stock Code", "Stock Name", "Product", "Category", "Size", "Color", "Brand", "Unit of Measure", "Opening Quantity"],
    ["", `${tag("Steel Tumbler")} - 500 ml - Black - NA`, "Steel Tumbler", "Drinkware", "500 ml", "Black", "", "Nos", 60],
    ["", `${tag("Lanyard")} - NA - Blue - NA`, "Lanyard", "", "", "Blue", "", "", 200],
    ["MAV-00005", "Duplicate code row", "Mavericks T-Shirt", "Apparel", "L", "", "", "", 5],
    ["", "Bad quantity row", "Mug", "Drinkware", "", "", "", "", "ten"],
  ])
  let text = await upload(exec, "/stock/upload", stockFile)
  assert.match(text, /2 of 4 rows saved/)
  assert.match(text, /already exists/)
  assert.match(text, /whole number/)
  await shot(exec, "18-stock-upload-result")
  ok("stock upload saves valid rows as a draft and lists the bad ones")

  const recipientFile = join(dir, `recipients-${RUN || "shots"}.xlsx`)
  await writeXlsx(recipientFile, "Recipient", [
    ["Date of Delivery", "Emp ID", "Name", "Base Location", "Catogory", "POC", "Product Details", "Product", "Size / Quantity", "Color", "Brand", "Status"],
    [46300, "2000777001", "Lakshmi Prasad", "Chennai", "Onboarding", "Kavin Raj", "Bottle - 600 ml - Black - Behome", "Bottle", "600 ml", "Black", "Behome", "Distributed"],
    [46300, "2000777002", "Rohit Nair", "Pune", "Onboarding", "Kavin Raj", "Bag - Jute - Brown - NA", "Bag", "Jute", "Brown", "NA", "Distributed"],
    ["25-10-2026", "2000777003", "Unknown item", "Chennai", "Onboarding", "Kavin Raj", "Unicorn Hoodie - XL", "", "", "", "", ""],
  ])
  text = await upload(exec, "/distributions/upload", recipientFile)
  assert.match(text, /2 of 3 rows saved/)
  assert.match(text, /No active stock item matches/)
  await shot(exec, "19-distribution-upload-result")
  ok("the old Recipient sheet uploads without reformatting")
  const errHref = await exec.getByRole("link", { name: "Error report" }).getAttribute("href")
  const errRes = await exec.request.get(BASE + errHref)
  assert.equal(errRes.status(), 200)
  ok("error report downloads as Excel")

  const receiptFile = join(dir, `receipt-${RUN || "shots"}.xlsx`)
  await writeXlsx(receiptFile, "Procurement", [
    ["Date", "Product Details", "Procured"],
    [46300, "Mavericks T-Shirt - L - Ash - Crocodile", 40],
  ])
  text = await upload(exec, "/receipts/upload", receiptFile)
  assert.match(text, /1 of 1 rows saved/)
  ok("the old Procurement sheet uploads as stock inward")

  // ------------------------------------------------------------------
  step("Drafts")
  await go(exec, "/requests?status=DRAFT")
  await shot(exec, "20-my-requests")
  // Make a draft of our own so the test can be repeated on the same database.
  await go(exec, "/distributions/new")
  await exec.fill("#title", tag("Draft to throw away"))
  await pickItem(exec, "Ball Pen")
  await exec.getByLabel("Recipient name, line 1").fill("Training desk")
  await Promise.all([exec.waitForURL(/\/requests\//, { timeout: 90_000 }), exec.getByRole("button", { name: "Save draft" }).click()])
  await exec.getByText("Draft", { exact: true }).first().waitFor()
  ok("an executive saves a draft without submitting it")
  await exec.getByRole("button", { name: "Delete draft" }).click()
  await alertDialog(exec).getByRole("button", { name: "Delete draft" }).click()
  await exec.waitForURL(/\/requests$/)
  ok("an executive deletes a draft (kept as Deleted in the audit trail)")

  // ------------------------------------------------------------------
  step("Bulk approval")
  // Two small requests of our own, so the queue is never empty (also on repeat runs).
  for (const [title, who] of [["Welcome kit pens, Chennai", "Meena Raghavan"], ["Welcome kit pens, Pune", "Arun Kulkarni"]]) {
    await go(exec, "/distributions/new")
    await exec.fill("#title", tag(title))
    await pickItem(exec, "Ball Pen")
    await exec.getByLabel("Recipient name, line 1").fill(who)
    await Promise.all([exec.waitForURL(/\/requests\//, { timeout: 90_000 }), exec.getByRole("button", { name: "Submit for approval" }).click()])
  }
  await go(manager, "/approvals")
  const selectAll = manager.getByRole("checkbox", { name: "Select all requests that can be approved" })
  await selectAll.click()
  const bulkBtn = manager.getByRole("button", { name: /^Approve \d+ selected$/ })
  await bulkBtn.waitFor()
  await shot(manager, "21-bulk-approve")
  const bulkCount = Number((await bulkBtn.innerText()).match(/\d+/)[0])
  await bulkBtn.click()
  await manager.getByText(/Approved \d+ request/).first().waitFor({ timeout: 60_000 })
  ok(`manager approves ${bulkCount} requests at once`)

  // ------------------------------------------------------------------
  step("Reports and exports")
  for (const [r, name] of [
    ["availability", "22-report-availability"],
    ["distributed", "23-report-distributed"],
    ["pending", "24-report-pending"],
    ["approvals", "25-report-approvals"],
    ["ledger", "26-report-ledger"],
  ]) {
    await go(manager, `/reports?r=${r}`)
    await shot(manager, name)
    for (const format of ["xlsx", "pdf"]) {
      const res = await manager.request.get(`${BASE}/api/reports/${r}?format=${format}`)
      assert.equal(res.status(), 200, `${r} ${format}`)
      assert.match(res.headers()["content-type"], format === "pdf" ? /pdf/ : /spreadsheetml/)
    }
  }
  ok("all five reports open and export to Excel and PDF")
  const reqExport = await manager.request.get(`${BASE}/api/requests/${distUrl.split("/").pop()}/export`)
  assert.equal(reqExport.status(), 200)
  ok("a single request exports to Excel")

  // ------------------------------------------------------------------
  step("Administration")
  await go(admin, "/admin/users")
  await admin.getByRole("button", { name: "Add user" }).click()
  const newEmail = RUN ? `priya.${RUN}@mavericks.demo` : "priya.venkat@mavericks.demo"
  await dialog(admin).locator("#u-emp").fill(RUN ? `EXE${RUN}` : "EXE003")
  await dialog(admin).locator("#u-name").fill(tag("Priya Venkat"))
  await dialog(admin).locator("#u-email").fill(newEmail)
  await dialog(admin).locator("#u-dept").fill("Mavericks L&D")
  await shot(admin, "27-add-user")
  await dialog(admin).getByRole("button", { name: "Create user" }).click()
  const temp = (await dialog(admin).locator("code").innerText()).trim()
  await shot(admin, "28-one-time-password")
  await dialog(admin).getByRole("button", { name: "Done" }).click()
  ok("admin creates a user and gets a one-time password")

  const priya = await signIn(newEmail, temp)
  assert.match(priya.url(), /\/profile/)
  await go(priya, "/stock")
  assert.match(priya.url(), /\/profile/)
  await shot(priya, "29-first-sign-in")
  ok("a one-time password forces a password change before anything else")
  await priya.fill("#cur", temp)
  await priya.fill("#new", `Welcome${RUN}@2026`)
  await priya.fill("#con", `Welcome${RUN}@2026`)
  await priya.getByRole("button", { name: "Change password" }).click()
  await priya.waitForURL((u) => u.pathname === "/", { timeout: 30_000 })
  ok("after choosing a password the new user reaches the overview")

  await go(admin, "/admin/users")
  await admin.getByRole("button", { name: `Edit ${tag("Priya Venkat")}`, exact: true }).click()
  await dialog(admin).locator("#u-active").click()
  await dialog(admin).getByRole("button", { name: "Save user" }).click()
  await dialog(admin).waitFor({ state: "detached" })
  await shot(admin, "30-users")
  {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await go(p, "/login")
    await p.fill("#email", newEmail)
    await p.fill("#password", `Welcome${RUN}@2026`)
    await p.click("button[type=submit]")
    await p.getByText("This account is deactivated").waitFor()
    await ctx.close()
  }
  ok("a deactivated user can't sign in")

  await go(admin, "/admin/workflow")
  await shot(admin, "31-approval-rules")
  await admin.getByRole("button", { name: "Save rules" }).click()
  await admin.getByText("Workflow rules saved").waitFor()
  ok("approval rules save")

  await go(admin, "/admin/masters")
  await admin.getByLabel("New Purposes").fill(tag("Campus drive"))
  await admin.getByLabel("New Purposes").press("Enter")
  await admin.getByText(tag("Campus drive")).waitFor()
  await shot(admin, "32-master-data")
  ok("admin adds a purpose to the master list")

  await go(admin, "/admin/audit")
  await admin.getByText("Approved", { exact: false }).first().waitFor()
  await shot(admin, "33-audit-log")
  ok("audit log lists sign-ins, changes and decisions")

  // ------------------------------------------------------------------
  step("Search, profile, dark mode and phone layout")
  await go(exec, "/")
  await exec.keyboard.press("Control+k")
  await exec.keyboard.type("Smart Watch")
  await exec.locator("[cmdk-item]").filter({ hasText: "Smart Watch" }).first().waitFor()
  await shot(exec, "34-search")
  ok("Ctrl+K search finds items")
  await exec.keyboard.press("Escape")
  await go(exec, "/profile")
  await shot(exec, "35-profile")

  const dark = await signIn("manager@mavericks.demo", PASSWORD, { dark: true })
  await go(dark, "/")
  await shot(dark, "36-dark-mode")
  const phone = await signIn("executive@mavericks.demo", PASSWORD, { viewport: { width: 390, height: 844 } })
  await go(phone, "/stock")
  await shot(phone, "37-phone")
  ok("dark mode and phone layout render")

  console.log(`\nAll ${passed} checks passed.`)
} catch (e) {
  console.error(`\nFAILED after ${passed} passing checks:\n`, e)
  process.exitCode = 1
} finally {
  await browser.close()
}
