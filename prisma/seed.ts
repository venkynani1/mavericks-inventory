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
import { ensureBaseData } from "./base-data"

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

let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
let empSeq = 150000
const person = () => ({ id: `2000${empSeq++}`, name: `${pick(FIRST)} ${pick(LAST)}` })
const year0 = () => new Date().getFullYear()


type Person = { id: string; name: string }
type EngagementCtx = { items: { id: string; name: string }[]; exec: Person; exec2: Person; mgr: Person; hash: string; at: (daysAgo: number, hour?: number) => Date; reqNo: (p: string) => string }

/** Employees, ~30 events with attendance, points through the same rules the app uses, rewards (some issued) and the demo employee login. */
async function seedEngagement({ items, exec, exec2, mgr, hash, at, reqNo }: EngagementCtx) {
  // ---- engagement rewards: employees, events, attendance and points -------------------------
  // Everyone who has received goodies becomes an employee record (names and IDs are generated).
  const DEPTS = ["Digital Engineering", "Cloud & Infra", "Data & AI", "Banking & Financial Services", "Healthcare", "Talent Transformation", "Quality Engineering"]
  const DESIG = ["Associate Software Engineer", "Software Engineer", "Senior Software Engineer", "Technical Lead", "Business Analyst", "Consultant"]
  const recips = await prisma.distributionLine.findMany({ where: { recipientId: { not: null } }, distinct: ["recipientId"], select: { recipientId: true, recipientName: true, location: true } })
  const portalEmp = { empId: "2000149999", name: "Priyanka Sharma", email: "employee@mavericks.demo", department: "Data & AI", designation: "Software Engineer", location: "Chennai" }
  await prisma.employee.createMany({
    data: [
      portalEmp,
      ...recips.map((r) => ({
        empId: r.recipientId!, name: r.recipientName, department: pick(DEPTS), designation: pick(DESIG), location: r.location ?? "Chennai",
        email: `${r.recipientName.toLowerCase().replace(/[^a-z]+/g, ".")}.${r.recipientId!.slice(-4)}@hexaware.example`,
      })),
    ],
    skipDuplicates: true,
  })
  const employees = await prisma.employee.findMany({ orderBy: { empId: "asc" } })
  const priyanka = employees.find((e) => e.empId === portalEmp.empId)!
  await prisma.user.create({ data: { empId: portalEmp.empId, name: portalEmp.name, email: portalEmp.email, role: "EMPLOYEE", department: portalEmp.department, location: "Chennai", passwordHash: hash, employeeId: priyanka.id } })

  // Milestone goodies (18,000 and 20,000 are left "to be decided" to show that case).
  const goodieFor: [number, RegExp][] = [[2000, /Coffee Mug - NA - Blue/], [4000, /Bottle - 600 ml - Black - Behome/], [6000, /Bag - Back - Blue/], [8000, /Flask/], [10000, /Headphones - Large - Red/], [12000, /Bluetooth Speaker/], [14000, /Bag - Back - Black/], [16000, /Smart Watch/]]
  for (const [threshold, re] of goodieFor) {
    const it = items.find((i) => re.test(i.name))
    if (it) await prisma.rewardMilestone.update({ where: { threshold }, data: { stockItemId: it.id } })
  }

  const types = Object.fromEntries((await prisma.eventType.findMany()).map((t) => [t.name, t]))
  const EVENTS: [string, string, number, string][] = [
    // name, type, days ago, location
    ["GenAI Tech Talk: RAG in practice", "Tech talk", 170, "Chennai"], ["Cloud Workshop: AWS foundations", "Workshop", 165, "Chennai"], ["Onam celebration", "Non-tech event", 160, "Chennai"],
    ["Codeathon: Java collections sprint", "Codeathon", 152, "Pune"], ["Webinar: Kubernetes 101", "Webinar", 146, "Online"], ["Leaders Connect Q2", "Leadership connect", 140, "Chennai"],
    ["Mavericks Hackathon 2026", "Hackathon", 132, "Chennai"], ["Tech talk: Spring Boot 3 observability", "Tech talk", 125, "Bengaluru"], ["Blood donation drive", "CSR activity", 118, "Chennai"],
    ["Workshop: Prompt engineering", "Workshop", 110, "Chennai"], ["Design-a-thon 2026", "Hackathon", 102, "Chennai"], ["Sports day", "Non-tech event", 96, "Chennai"],
    ["Tech event: Hexaware Tech Day", "Tech event", 90, "Mumbai"], ["Codeathon: Python data challenge", "Codeathon", 82, "Chennai"], ["Webinar: Secure coding", "Webinar", 76, "Online"],
    ["Workshop: React performance", "Workshop", 70, "Chennai"], ["Leaders Connect Q3", "Leadership connect", 62, "Chennai"], ["Tech talk: Event-driven systems", "Tech talk", 55, "Pune"],
    ["Navratri dandiya night", "Non-tech event", 48, "Chennai"], ["Workshop: Azure DevOps pipelines", "Workshop", 41, "Chennai"], ["Hackathon: Agentic AI", "Hackathon", 34, "Chennai"],
    ["Tech talk: Vector databases", "Tech talk", 27, "Online"], ["Tree plantation drive", "CSR activity", 21, "Chennai"], ["Codeathon: SQL tuning", "Codeathon", 14, "Bengaluru"],
    ["Diwali celebration", "Non-tech event", 7, "Chennai"], ["Workshop: Testing with Playwright", "Workshop", 3, "Chennai"],
  ]
  const UPCOMING: [string, string, number, string][] = [["Mavericks Week 2026: Tech day", "Tech event", -6, "Chennai"], ["Hackathon: Battlegrounds", "Hackathon", -14, "Chennai"], ["Workshop: Data engineering on Spark", "Workshop", -20, "Online"]]
  const core = employees.filter((e) => e.id !== priyanka.id).slice(0, 45) // the regulars
  const rules = { step: 2000, cap: 20000 }
  const balance = new Map<string, number>()
  const attendRows: { eventId: string; employeeId: string; pointsAwarded: number; createdById: string; createdAt: Date }[] = []
  const txRows: { employeeId: string; type: "EVENT"; points: number; requested: number; balanceAfter: number; cycle: number; eventId: string; reason: string; actorId: string; createdAt: Date }[] = []
  const earned: { employeeId: string; threshold: number; cycle: number; title: string; earnedAt: Date }[] = []
  const titles = Object.fromEntries((await prisma.rewardMilestone.findMany()).map((m) => [m.threshold, m.title]))
  let evNo = 0
  for (const [name, typeName, daysAgo, location] of EVENTS) {
    const t = types[typeName]
    const ev = await prisma.event.create({
      data: { code: `EV-${year0()}-${String(++evNo).padStart(4, "0")}`, name, eventTypeId: t.id, date: at(daysAgo, 15), location, organizer: pick(["Kavin Raj", "Divya Menon"]), status: "COMPLETED", createdById: pick([exec, exec2]).id, createdAt: at(daysAgo + 10) },
    })
    const crowd = new Set<(typeof employees)[number]>()
    core.forEach((e) => rand() < 0.55 && crowd.add(e))
    const extra = 8 + Math.floor(rand() * 40)
    for (let i = 0; i < extra; i++) crowd.add(employees[Math.floor(rand() * employees.length)])
    if (daysAgo !== 96 && daysAgo !== 160 && rand() < 0.92) crowd.add(priyanka)
    for (const e of crowd) {
      const before = balance.get(e.id) ?? 0
      const after = Math.min(rules.cap, before + t.points)
      balance.set(e.id, after)
      const when = at(daysAgo, 18)
      attendRows.push({ eventId: ev.id, employeeId: e.id, pointsAwarded: t.points, createdById: exec.id, createdAt: when })
      txRows.push({ employeeId: e.id, type: "EVENT", points: after - before, requested: t.points, balanceAfter: after, cycle: 1, eventId: ev.id, reason: `${ev.code} ${name}`, actorId: exec.id, createdAt: when })
      for (let m = rules.step; m <= rules.cap; m += rules.step) if (m > before && m <= after) earned.push({ employeeId: e.id, threshold: m, cycle: 1, title: titles[m], earnedAt: when })
    }
  }
  for (const [name, typeName, daysAgo, location] of UPCOMING)
    await prisma.event.create({ data: { code: `EV-${year0()}-${String(++evNo).padStart(4, "0")}`, name, eventTypeId: types[typeName].id, date: at(daysAgo, 10), location, organizer: "Kavin Raj", status: "PLANNED", createdById: exec.id } })
  await prisma.attendance.createMany({ data: attendRows })
  await prisma.pointsTransaction.createMany({ data: txRows })
  for (const [id, pts] of balance) await prisma.employee.update({ where: { id }, data: { points: pts, lifetimePoints: pts } })
  await prisma.rewardEarned.createMany({ data: earned })

  // Hand out the earliest 2,000-point rewards (and Priyanka's first two) through an approved distribution.
  const toIssue = [
    ...(await prisma.rewardEarned.findMany({ where: { employeeId: priyanka.id, threshold: { in: [2000, 4000] } }, include: { employee: true } })),
    ...(await prisma.rewardEarned.findMany({ where: { threshold: 2000, employeeId: { not: priyanka.id } }, orderBy: { earnedAt: "asc" }, take: 10, include: { employee: true } })),
  ]
  const milestoneItems = Object.fromEntries((await prisma.rewardMilestone.findMany()).map((m) => [m.threshold, m.stockItemId]))
  const rwReq = await prisma.request.create({
    data: {
      number: reqNo("DST"), type: "DISTRIBUTION", status: "APPROVED", title: "Points rewards: September milestones", purpose: "Points reward", createdById: exec.id,
      submittedAt: at(20, 10), decidedAt: at(19, 12), currentLevel: 1, requiredLevel: 1, totalQty: toIssue.length, lineCount: toIssue.length, createdAt: at(20, 9),
    },
  })
  for (const r of toIssue) {
    const stockItemId = milestoneItems[r.threshold]!
    await prisma.distributionLine.create({
      data: { requestId: rwReq.id, stockItemId, quantity: 1, distributedOn: at(20, 12), recipientId: r.employee.empId, recipientName: r.employee.name, location: r.employee.location, purpose: "Points reward", poc: exec.name, remarks: `${r.threshold.toLocaleString("en-IN")}-point milestone (${r.title})`, rewardId: r.id },
    })
    await prisma.rewardEarned.update({ where: { id: r.id }, data: { status: "ISSUED", issuedAt: at(19, 12), requestId: rwReq.id } })
  }
  const issuedByItem = new Map<string, number>()
  for (const r of toIssue) issuedByItem.set(milestoneItems[r.threshold]!, (issuedByItem.get(milestoneItems[r.threshold]!) ?? 0) + 1)
  for (const [itemId, qty] of issuedByItem) {
    const it = await prisma.stockItem.update({ where: { id: itemId }, data: { availableQty: { decrement: qty }, distributedQty: { increment: qty } } })
    await prisma.ledgerEntry.create({ data: { stockItemId: itemId, requestId: rwReq.id, type: "DISTRIBUTION", qtyOut: qty, balanceAfter: it.availableQty, actorId: mgr.id, createdAt: at(19, 12) } })
  }
  await prisma.approvalEvent.createMany({
    data: [
      { requestId: rwReq.id, action: "SUBMITTED", actorId: exec.id, createdAt: at(20, 10) },
      { requestId: rwReq.id, action: "APPROVED", level: 1, actorId: mgr.id, createdAt: at(19, 12) },
    ],
  })
  return evNo

}

/**
 * A database seeded before the engagement module existed gets its demo employees, events and
 * points added on the next deploy (only when the demo accounts exist and there are no employees yet).
 */
async function upgradeDemo() {
  const [exec, exec2, mgr] = await Promise.all(["executive@mavericks.demo", "executive2@mavericks.demo", "manager@mavericks.demo"].map((email) => prisma.user.findUnique({ where: { email } })))
  if (!exec || !mgr || (await prisma.employee.count()) > 0) return false
  await ensureBaseData(prisma)
  const password = process.env.SEED_PASSWORD || "Mavericks@2026"
  const hash = await bcrypt.hash(password, 10)
  const now = Date.now()
  const at = (daysAgo: number, hour = 11) => new Date(now - daysAgo * DAY + (hour - 12) * 3600_000)
  const year = new Date().getFullYear()
  const pending: Record<string, number> = {}
  const base = Object.fromEntries((await prisma.counter.findMany({ where: { key: { startsWith: "req:" } } })).map((c) => [c.key, c.value]))
  const reqNo = (p: string) => {
    const key = `req:${p}:${year}`
    pending[key] = (pending[key] ?? base[key] ?? 0) + 1
    return `MI-${p}-${year}-${String(pending[key]).padStart(6, "0")}`
  }
  const items = await prisma.stockItem.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } })
  const evNo = await seedEngagement({ items, exec, exec2: exec2 ?? exec, mgr, hash, at, reqNo })
  for (const [key, value] of Object.entries({ ...pending, [`event:${year}`]: evNo }))
    await prisma.counter.upsert({ where: { key }, create: { key, value }, update: { value } })
  await prisma.auditLog.create({ data: { actorId: null, action: "SYSTEM.SEED", entity: "System", summary: `Added engagement demo data: ${await prisma.employee.count()} employees and ${evNo} events` } })
  console.log(`Added engagement demo data (${evNo} events) and the employee demo login employee@mavericks.demo.`)
  return true
}

/**
 * Demo prizes: winners and runners-up at three hackathons/codeathons. The older event's prizes are
 * handed over (vouchers with order references, a trophy); the recent ones wait in Event prizes.
 * Runs on a fresh seed and once on an older demo database that has events but no prizes.
 */
async function seedPrizes() {
  const exec = await prisma.user.findUnique({ where: { email: "executive@mavericks.demo" } })
  if (!exec || (await prisma.eventAward.count()) > 0) return 0
  const ev = async (name: string) => prisma.event.findFirst({ where: { name }, include: { attendance: { include: { employee: true }, orderBy: { createdAt: "asc" } } } })
  const item = async (re: string) => (await prisma.stockItem.findFirst({ where: { status: "ACTIVE", name: { contains: re, mode: "insensitive" } } }))?.id ?? null
  const plan: { event: string; prizes: { position: string; kind: "GOODIE" | "VOUCHER" | "OTHER"; amount?: number; item?: string; description?: string; issued?: string; preferPriyanka?: boolean }[] }[] = [
    { event: "Mavericks Hackathon 2026", prizes: [
      { position: "Winner", kind: "VOUCHER", amount: 10000, issued: "Amazon order 403-5512870-1180331" },
      { position: "Runner-up", kind: "VOUCHER", amount: 5000, issued: "Amazon order 403-5512870-1180332" },
      { position: "Second runner-up", kind: "VOUCHER", amount: 3000, issued: "Amazon order 403-5512870-1180333" },
      { position: "Special mention", kind: "OTHER", description: "Trophy and certificate, best pitch", issued: "Handed over at the town hall" },
    ] },
    { event: "Hackathon: Agentic AI", prizes: [
      { position: "Winner", kind: "VOUCHER", amount: 5000, preferPriyanka: true },
      { position: "Runner-up", kind: "GOODIE", item: "Smart Watch" },
      { position: "Second runner-up", kind: "VOUCHER", amount: 2000 },
      { position: "Top performer", kind: "GOODIE", item: "Bluetooth Speaker" },
    ] },
    { event: "Codeathon: SQL tuning", prizes: [
      { position: "Winner", kind: "VOUCHER", amount: 3000 },
      { position: "Special mention", kind: "OTHER", description: "Certificate of excellence" },
    ] },
  ]
  let n = 0
  for (const p of plan) {
    const e = await ev(p.event)
    if (!e || e.attendance.length < p.prizes.length) continue
    const pool = [...e.attendance]
    for (const prize of p.prizes) {
      const idx = prize.preferPriyanka ? Math.max(0, pool.findIndex((a) => a.employee.empId === "2000149999")) : pool.length > 1 && pool[0].employee.empId === "2000149999" ? 1 : 0
      const [winner] = pool.splice(idx, 1)
      await prisma.eventAward.create({
        data: {
          eventId: e.id, employeeId: winner.employeeId, position: prize.position, kind: prize.kind, quantity: 1,
          stockItemId: prize.item ? await item(prize.item) : null, voucherProvider: prize.kind === "VOUCHER" ? "Amazon" : null, voucherAmount: prize.amount ?? null,
          description: prize.description ?? null, status: prize.issued ? "ISSUED" : "PENDING", voucherRef: prize.issued ?? null,
          issuedAt: prize.issued ? new Date(e.date.getTime() + 5 * 86400_000) : null, issuedById: prize.issued ? exec.id : null, createdById: exec.id, createdAt: new Date(e.date.getTime() + 86400_000),
        },
      })
      n++
    }
  }
  if (n) console.log(`Added ${n} demo event prizes.`)
  return n
}

async function main() {
  if (await prisma.user.count()) {
    // Older databases get any new standard lists (event types, prize positions) without touching existing values.
    await ensureBaseData(prisma)
    const upgraded = await upgradeDemo()
    const prizes = await seedPrizes()
    if (!upgraded && !prizes) console.log("Database already has data, so the seed was skipped. Run `npm run db:reset` to start fresh.")
    return
  }
  const password = process.env.SEED_PASSWORD || "Mavericks@2026"
  const hash = await bcrypt.hash(password, 10)

  // ---- settings & masters (shared with production setup), demo uses two-level approval above 100 units
  await ensureBaseData(prisma)
  // The demo uses two approval levels above 100 units, even if the database was set up earlier without demo data.
  for (const [key, value] of Object.entries({ approvalLevels: "2", level2Threshold: "100" }))
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
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
      number: reqNo("STK"), type: "STOCK_MASTER", status: "APPROVED", title: "Opening stock: Sep 25 stock count",
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
        title: `${b.purpose}: goodies handover`, purpose: b.purpose, createdById: maker.id,
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
      number: reqNo("RCV"), type: "RECEIPT", status: "SUBMITTED", title: "Crocodile T-shirt replenishment", purpose: "PO 4471, Crocodile",
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
  const pend = await mkDist({ status: "SUBMITTED", title: "Intern welcome, batch 14", purpose: "Internship", maker: exec, daysAgo: 4, picks: [[/Welcome Kit - M/, 6], [/Welcome Kit - L/, 4], [/Bottle - 600 ml - Black/, 10]] })
  await prisma.approvalEvent.create({ data: { requestId: pend.id, action: "SUBMITTED", actorId: exec.id, createdAt: at(4) } })

  const rej = await mkDist({ status: "REJECTED", title: "Hackathon winners: smart watches", purpose: "Event - Participation", maker: exec2, daysAgo: 6, picks: [[/Smart Watch/, 12]] })
  await prisma.approvalEvent.createMany({
    data: [
      { requestId: rej.id, action: "SUBMITTED", actorId: exec2.id, createdAt: at(6) },
      { requestId: rej.id, action: "REJECTED", level: 1, actorId: mgr.id, remarks: "Only the top 3 teams get watches. Reduce to 9 and attach the results mail.", createdAt: at(5) },
    ],
  })

  await mkDist({ status: "DRAFT", title: "Mavericks Week, day 2 goodies", purpose: "Mavericks Week", maker: exec, daysAgo: 0, picks: [[/Bluetooth Speaker/, 5], [/Coffee Mug/, 8]] })

  counters.EVENT = await seedEngagement({ items, exec, exec2, mgr, hash, at, reqNo })
  const evNo = counters.EVENT

  // ---- counters so new numbers continue from the seed
  const year = new Date().getFullYear()
  await prisma.counter.createMany({
    data: [
      { key: `req:STK:${year}`, value: counters.STK ?? 0 },
      { key: `req:DST:${year}`, value: counters.DST ?? 0 },
      { key: `req:RCV:${year}`, value: counters.RCV ?? 0 },
      { key: "stock-code", value: code },
      { key: `event:${year}`, value: counters.EVENT ?? 0 },
    ],
  })

  await seedPrizes()
  await prisma.auditLog.create({ data: { actorId: U.ADMIN.id, action: "SYSTEM.SEED", entity: "System", summary: `Loaded ${rows.length} stock items and ${batches.length} approved distributions from the Sep 25 tracker` } })
  console.log(`Seeded ${rows.length} items, ${batches.length} historical distributions, ${await prisma.employee.count()} employees, ${evNo} events. Demo password: ${password}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
