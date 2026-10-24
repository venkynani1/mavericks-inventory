/**
 * Seeds Mavericks Inventory with:
 *  - workflow settings, masters and one demo user per role
 *  - the stock master from "Updated stock details - Sep 25.xlsx" (real item list and quantities)
 *  - approved distribution history that reproduces each item's distributed quantity
 *    (recipient names are generated — no real employee data is stored in the repo)
 *  - pending, rejected and draft requests built from the "Apr 26" tracker so every screen has something to show
 *
 * Run: npm run db:seed   (safe to re-run only on an empty database; use `npm run db:reset` to start over)
 */
import { PrismaClient, type Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import stockRows from "./seed-data/stock-sep25.json"

const prisma = new PrismaClient()
const DAY = 86400_000

type Row = { name: string; product: string; size: string | null; color: string | null; brand: string | null; procured: number; distributed: number; available: number }

const clean = (v: string | null | undefined) => (!v || v.trim().toUpperCase() === "NA" ? null : v.trim())

function category(product: string) {
  const p = product.toLowerCase()
  if (/t-?shirt/.test(p)) return "Apparel"
  if (/welcome kit/.test(p)) return "Welcome Kits"
  if (/bottle|flask|mug/.test(p)) return "Drinkware"
  if (/bag/.test(p)) return "Bags"
  if (/headphone|speaker|watch|mouse/.test(p)) return "Electronics"
  return "Stationery"
}

// Which programme each product family was handed out for, following the Sep 25 recipient sheet.
function purposesFor(name: string): string[] {
  if (/Design-a-thon T-Shirt/.test(name)) return ["Event - Design-a-thon", "Event - Design-a-thon", "Leaders Connect", "HPL Event"]
  if (/Mavericks T-Shirt/.test(name)) return ["Onboarding", "Onboarding", "Event - Participation"]
  if (/Welcome Kit/.test(name)) return ["Onboarding"]
  if (/Smart Watch/.test(name)) return ["Event - Design-a-thon", "Event - Design-a-thon", "Leaders Connect", "Event - La Laurea"]
  if (/Headphones/.test(name)) return ["Event - La Laurea", "Mavericks Week", "Mavericks Week"]
  if (/Flask|Speaker|Coffee Mug/.test(name)) return ["Mavericks Week"]
  if (/Jute/.test(name)) return ["Event - La Laurea", "Onboarding", "Leaders Connect", "Corporate Overview"]
  if (/Bottle/.test(name)) return ["Onboarding", "Corporate Overview", "Mavericks Week"]
  return ["Onboarding"]
}

const FIRST = ["Aarav", "Diya", "Ishaan", "Ananya", "Vihaan", "Saanvi", "Arjun", "Meera", "Kabir", "Nithya", "Rohan", "Kavya", "Siddharth", "Lakshmi", "Varun", "Pooja", "Aditya", "Harini", "Nikhil", "Sneha", "Karthik", "Riya", "Pranav", "Divya", "Surya", "Tanvi", "Rahul", "Keerthi", "Vikram", "Asha"]
const LAST = ["Iyer", "Reddy", "Nair", "Sharma", "Rao", "Menon", "Pillai", "Kumar", "Patil", "Gupta", "Shetty", "Joshi", "Krishnan", "Varma", "Das", "Bhat", "Naidu", "Prasad", "Singh", "Raman"]
const LOCATIONS = ["Chennai", "Chennai", "Chennai", "Pune", "Mumbai", "Bengaluru"]
const POCS = ["Kavin Raj", "Divya Menon"]

let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
let empSeq = 150000
const person = () => ({ id: `2000${empSeq++}`, name: `${pick(FIRST)} ${pick(LAST)}` })

async function main() {
  if (await prisma.user.count()) {
    console.log("Database already has data — skipping seed. Run `npm run db:reset` to start fresh.")
    return
  }
  const password = process.env.SEED_PASSWORD || "Mavericks@2026"
  const hash = await bcrypt.hash(password, 10)

  // ---- settings & masters
  await prisma.setting.createMany({
    data: [
      { key: "approvalLevels", value: "2" },
      { key: "level2Threshold", value: "100" },
      { key: "preventNegativeStock", value: "true" },
      { key: "escalationHours", value: "48" },
    ],
  })
  const lookups = [
    ...["Chennai", "Pune", "Mumbai", "Bengaluru", "Noida"].map((value, i) => ({ kind: "LOCATION", value, sortOrder: i })),
    ...["Onboarding", "Internship", "Event - Design-a-thon", "Event - Participation", "Event - La Laurea", "Mavericks Week", "Leaders Connect", "HPL Event", "Corporate Overview", "Farewell"].map((value, i) => ({ kind: "PURPOSE", value, sortOrder: i })),
    ...["Nos", "Pack", "Box", "Set"].map((value, i) => ({ kind: "UNIT", value, sortOrder: i })),
  ]
  await prisma.lookup.createMany({ data: lookups })
  const cats = ["Apparel", "Welcome Kits", "Drinkware", "Bags", "Electronics", "Stationery", "General"]
  await prisma.category.createMany({ data: cats.map((name) => ({ name })) })
  const catId = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.name, c.id]))

  // ---- users (one per role, plus a second executive)
  const users: { empId: string; name: string; email: string; role: Role; department: string }[] = [
    { empId: "ADM001", name: "Sanjana Rao", email: "admin@mavericks.demo", role: "ADMIN", department: "IT Applications" },
    { empId: "EXE001", name: "Kavin Raj", email: "executive@mavericks.demo", role: "EXECUTIVE", department: "Mavericks L&D" },
    { empId: "EXE002", name: "Divya Menon", email: "executive2@mavericks.demo", role: "EXECUTIVE", department: "Mavericks L&D" },
    { empId: "MGR001", name: "Rahul Iyer", email: "manager@mavericks.demo", role: "MANAGER", department: "Mavericks L&D" },
    { empId: "AUT001", name: "Meera Krishnan", email: "authority@mavericks.demo", role: "AUTHORITY", department: "Talent Transformation" },
  ]
  for (const u of users) await prisma.user.create({ data: { ...u, passwordHash: hash, location: "Chennai" } })
  const U = Object.fromEntries((await prisma.user.findMany()).map((u) => [u.role === "EXECUTIVE" ? u.empId : u.role, u]))
  const exec = U.EXE001
  const exec2 = U.EXE002
  const mgr = U.MANAGER
  const auth = U.AUTHORITY

  const now = Date.now()
  const at = (daysAgo: number, hour = 11) => new Date(now - daysAgo * DAY + (hour - 12) * 3600_000)
  const counters: Record<string, number> = {}
  const reqNo = (p: string) => {
    counters[p] = (counters[p] ?? 0) + 1
    return `MI-${p}-${new Date().getFullYear()}-${String(counters[p]).padStart(6, "0")}`
  }

  // ---- opening stock master (approved)
  const rows = (stockRows as Row[]).map((r) => ({
    ...r,
    // Badges: the Sep 25 sheet shows 1000 procured, 0 available and no distributions — an unexplained gap.
    // We load what was procured; reconcile it in the app with a distribution or stock adjustment.
    opening: r.available + r.distributed === 0 ? r.procured : r.available + r.distributed,
    color: /coffee mug/i.test(r.name) ? "Blue" : r.color,
  }))
  const totalOpening = rows.reduce((s, r) => s + r.opening, 0)
  const master = await prisma.request.create({
    data: {
      number: reqNo("STK"), type: "STOCK_MASTER", status: "APPROVED", title: "Opening stock — Sep 25 stock count",
      purpose: "Migration from the Sep 25 Excel tracker", createdById: exec.id, submittedAt: at(130), decidedAt: at(129),
      currentLevel: 2, requiredLevel: 2, totalQty: totalOpening, lineCount: rows.length, createdAt: at(131),
    },
  })
  await prisma.approvalEvent.createMany({
    data: [
      { requestId: master.id, action: "SUBMITTED", level: 0, actorId: exec.id, createdAt: at(130) },
      { requestId: master.id, action: "APPROVED", level: 1, actorId: mgr.id, remarks: "Matches the physical count.", createdAt: at(129, 10) },
      { requestId: master.id, action: "APPROVED", level: 2, actorId: auth.id, createdAt: at(129, 15) },
    ],
  })

  const items: { id: string; name: string; distributed: number; available: number }[] = []
  let code = 0
  for (const r of rows) {
    const it = await prisma.stockItem.create({
      data: {
        code: `MAV-${String(++code).padStart(5, "0")}`,
        name: r.name.trim(),
        product: r.product.trim(),
        categoryId: catId[category(r.product)],
        size: clean(r.size), color: clean(r.color), brand: clean(r.brand),
        unit: "Nos", location: "Chennai",
        reorderLevel: r.opening >= 100 ? 25 : r.opening >= 20 ? 10 : 0,
        openingQty: r.opening, availableQty: r.opening, status: "ACTIVE",
        createdById: exec.id, requestId: master.id, createdAt: at(131),
      },
    })
    await prisma.ledgerEntry.create({
      data: { stockItemId: it.id, requestId: master.id, type: "OPENING", qtyIn: r.opening, balanceAfter: r.opening, actorId: auth.id, note: "Opening quantity", createdAt: at(129, 15) },
    })
    items.push({ id: it.id, name: it.name, distributed: r.distributed, available: r.opening })
  }
  counters.CODE = code

  // ---- historical distributions, grouped into approved requests by programme
  type L = { item: (typeof items)[number]; purpose: string }
  const byPurpose = new Map<string, L[]>()
  for (const it of items) {
    const ps = purposesFor(it.name)
    for (let i = 0; i < it.distributed; i++) {
      const p = ps[i % ps.length]
      if (!byPurpose.has(p)) byPurpose.set(p, [])
      byPurpose.get(p)!.push({ item: it, purpose: p })
    }
  }
  // Split each programme into a few batches spread across the last ~4 months.
  const batches: { purpose: string; lines: L[]; daysAgo: number }[] = []
  for (const [purpose, lines] of byPurpose) {
    const n = Math.max(1, Math.min(5, Math.ceil(lines.length / 120)))
    const size = Math.ceil(lines.length / n)
    for (let b = 0; b < n; b++) batches.push({ purpose, lines: lines.slice(b * size, (b + 1) * size), daysAgo: 0 })
  }
  batches.sort(() => rand() - 0.5)
  batches.forEach((b, i) => (b.daysAgo = Math.round(120 - (i * 112) / Math.max(1, batches.length - 1))))
  batches.sort((a, b) => b.daysAgo - a.daysAgo)

  for (const b of batches) {
    const maker = rand() > 0.4 ? exec : exec2
    const totalQty = b.lines.length
    const level = totalQty >= 100 ? 2 : 1
    const req = await prisma.request.create({
      data: {
        number: reqNo("DST"), type: "DISTRIBUTION", status: "APPROVED",
        title: `${b.purpose} — goodies handover`, purpose: b.purpose, createdById: maker.id,
        submittedAt: at(b.daysAgo + 1), decidedAt: at(b.daysAgo, 16), currentLevel: level, requiredLevel: level,
        totalQty, lineCount: totalQty, createdAt: at(b.daysAgo + 1, 9),
      },
    })
    const distributedOn = at(b.daysAgo + 1, 12)
    // One recipient often receives several items (e.g. a T-shirt, a bag and a bottle).
    let p = person()
    const lineData = b.lines.map((l, idx) => {
      if (idx % 3 === 0) p = person()
      return {
        requestId: req.id, stockItemId: l.item.id, quantity: 1, distributedOn, recipientId: p.id, recipientName: p.name,
        location: pick(LOCATIONS), purpose: b.purpose, poc: maker.name, createdAt: at(b.daysAgo + 1, 9),
      }
    })
    await prisma.distributionLine.createMany({ data: lineData })
    await prisma.approvalEvent.createMany({
      data: [
        { requestId: req.id, action: "SUBMITTED", level: 0, actorId: maker.id, createdAt: at(b.daysAgo + 1, 10) },
        { requestId: req.id, action: "APPROVED", level: 1, actorId: mgr.id, createdAt: at(b.daysAgo, 11) },
        ...(level === 2 ? [{ requestId: req.id, action: "APPROVED" as const, level: 2, actorId: auth.id, createdAt: at(b.daysAgo, 16) }] : []),
      ],
    })
    const qtyByItem = new Map<string, number>()
    for (const l of b.lines) qtyByItem.set(l.item.id, (qtyByItem.get(l.item.id) ?? 0) + 1)
    for (const [itemId, qty] of qtyByItem) {
      const it = items.find((x) => x.id === itemId)!
      it.available -= qty
      await prisma.ledgerEntry.create({
        data: { stockItemId: itemId, requestId: req.id, type: "DISTRIBUTION", qtyOut: qty, balanceAfter: it.available, actorId: level === 2 ? auth.id : mgr.id, createdAt: at(b.daysAgo, 16) },
      })
    }
  }
  for (const it of items)
    await prisma.stockItem.update({ where: { id: it.id }, data: { availableQty: it.available, distributedQty: it.distributed } })

  // ---- live work in progress, taken from the "Apr 26" tracker
  const find = (re: RegExp) => items.find((i) => re.test(i.name))!

  // 1) New items waiting for approval (stock master)
  const newItems = [
    { name: "Headphones - Large - Black - Boat (RGB)", product: "Headphones (RGB)", size: "Large", color: "Black", brand: "Boat", qty: 120 },
    { name: "Wireless mouse - NA - Black - NA", product: "Wireless mouse", size: null, color: "Black", brand: null, qty: 150 },
    { name: "Laptop sticker - NA - NA - NA", product: "Laptop sticker", size: null, color: null, brand: null, qty: 500 },
    { name: "BOT ALL COFFEE MUG - NA - Black - NA", product: "BOT ALL COFFEE MUG", size: null, color: "Black", brand: null, qty: 200 },
  ]
  const pendingMaster = await prisma.request.create({
    data: {
      number: reqNo("STK"), type: "STOCK_MASTER", status: "SUBMITTED", title: "New goodies for April onboarding", purpose: "Apr 26 procurement",
      createdById: exec.id, submittedAt: at(1, 10), requiredLevel: 2, totalQty: newItems.reduce((s, i) => s + i.qty, 0), lineCount: newItems.length, createdAt: at(1, 9),
    },
  })
  for (const n of newItems)
    await prisma.stockItem.create({
      data: {
        code: `MAV-${String(++code).padStart(5, "0")}`, name: n.name, product: n.product, categoryId: catId[category(n.product)],
        size: n.size, color: n.color, brand: n.brand, openingQty: n.qty, status: "DRAFT", createdById: exec.id, requestId: pendingMaster.id, location: "Chennai",
      },
    })
  await prisma.approvalEvent.create({ data: { requestId: pendingMaster.id, action: "SUBMITTED", actorId: exec.id, createdAt: at(1, 10) } })

  // 2) Stock inward for T-shirts — approved at level 1, waiting for level 2
  const tshirtL = find(/^Mavericks T-Shirt - L - Ash/)
  const tshirtM = find(/^Mavericks T-Shirt - M - Ash/)
  const rcv = await prisma.request.create({
    data: {
      number: reqNo("RCV"), type: "RECEIPT", status: "SUBMITTED", title: "Crocodile T-shirt replenishment", purpose: "PO 4471 — Crocodile",
      createdById: exec2.id, submittedAt: at(3), currentLevel: 1, requiredLevel: 2, totalQty: 160, lineCount: 2, createdAt: at(3, 9),
    },
  })
  await prisma.receiptLine.createMany({
    data: [
      { requestId: rcv.id, stockItemId: tshirtL.id, quantity: 100, receivedOn: at(3), remarks: "Carton 1–4" },
      { requestId: rcv.id, stockItemId: tshirtM.id, quantity: 60, receivedOn: at(3), remarks: "Carton 5–6" },
    ],
  })
  await prisma.approvalEvent.createMany({
    data: [
      { requestId: rcv.id, action: "SUBMITTED", actorId: exec2.id, createdAt: at(3, 10) },
      { requestId: rcv.id, action: "APPROVED", level: 1, actorId: mgr.id, remarks: "Counted with stores team.", createdAt: at(2, 12) },
    ],
  })

  // 3) Distribution waiting for level 1 (overdue, to show escalation)
  const mkDist = async (opts: { status: "SUBMITTED" | "REJECTED" | "DRAFT"; title: string; purpose: string; maker: typeof exec; daysAgo: number; picks: [RegExp, number][] }) => {
    const lines = opts.picks.flatMap(([re, n]) => Array.from({ length: n }, () => ({ it: find(re), p: person() })))
    const r = await prisma.request.create({
      data: {
        number: reqNo("DST"), type: "DISTRIBUTION", status: opts.status, title: opts.title, purpose: opts.purpose, createdById: opts.maker.id,
        submittedAt: opts.status === "DRAFT" ? null : at(opts.daysAgo), decidedAt: opts.status === "REJECTED" ? at(opts.daysAgo - 1) : null,
        requiredLevel: 1, totalQty: lines.length, lineCount: lines.length, createdAt: at(opts.daysAgo, 9),
      },
    })
    await prisma.distributionLine.createMany({
      data: lines.map(({ it, p }) => ({
        requestId: r.id, stockItemId: it.id, quantity: 1, distributedOn: at(opts.daysAgo), recipientId: p.id, recipientName: p.name,
        location: "Chennai", purpose: opts.purpose, poc: opts.maker.name,
      })),
    })
    return r
  }
  const pend = await mkDist({ status: "SUBMITTED", title: "Intern welcome — batch 14", purpose: "Internship", maker: exec, daysAgo: 4, picks: [[/Welcome Kit - M/, 6], [/Welcome Kit - L/, 4], [/Bottle - 600 ml - Black/, 10]] })
  await prisma.approvalEvent.create({ data: { requestId: pend.id, action: "SUBMITTED", actorId: exec.id, createdAt: at(4) } })

  const rej = await mkDist({ status: "REJECTED", title: "Hackathon winners — smart watches", purpose: "Event - Participation", maker: exec2, daysAgo: 6, picks: [[/Smart Watch/, 12]] })
  await prisma.approvalEvent.createMany({
    data: [
      { requestId: rej.id, action: "SUBMITTED", actorId: exec2.id, createdAt: at(6) },
      { requestId: rej.id, action: "REJECTED", level: 1, actorId: mgr.id, remarks: "Only the top 3 teams get watches. Reduce to 9 and attach the results mail.", createdAt: at(5) },
    ],
  })

  await mkDist({ status: "DRAFT", title: "Mavericks Week — day 2 goodies", purpose: "Mavericks Week", maker: exec, daysAgo: 0, picks: [[/Bluetooth Speaker/, 5], [/Coffee Mug/, 8]] })

  // ---- counters so new numbers continue from the seed
  const year = new Date().getFullYear()
  await prisma.counter.createMany({
    data: [
      { key: `req:STK:${year}`, value: counters.STK ?? 0 },
      { key: `req:DST:${year}`, value: counters.DST ?? 0 },
      { key: `req:RCV:${year}`, value: counters.RCV ?? 0 },
      { key: "stock-code", value: code },
    ],
  })

  await prisma.auditLog.create({ data: { actorId: U.ADMIN.id, action: "SYSTEM.SEED", entity: "System", summary: `Loaded ${rows.length} stock items and ${batches.length} approved distributions from the Sep 25 tracker` } })
  console.log(`Seeded ${rows.length} items, ${batches.length} historical distributions. Demo password: ${password}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
