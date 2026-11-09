import "server-only"
import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { audit } from "./audit"
import { AppError, type SessionUser } from "./session"

/*
 * Weekly Fusion (HR) report. The executive uploads it once a week; it adds new joiners and marks
 * people ACTIVE or RESIGNED. Only ACTIVE employees can earn points, order from the store, win
 * prizes or collect goodies. The file is read in the browser (it's ~10 MB, 35,000 rows) and only
 * the needed columns are sent here, in chunks.
 */

export type FusionRow = { empId: string; name: string; status: string; lwd: string | null; designation: string | null; grade: string | null; location: string | null; department: string | null }

export const FUSION_WEEK_DAYS = 7
export const FUSION_REMIND_DAYS = 5 // remind from day 5, i.e. two days before the week is up
export const FUSION_CHUNK = 2500

export async function startFusionImport(fileName: string, user: SessionUser) {
  const running = await prisma.fusionImport.findFirst({ where: { status: "RUNNING", createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } })
  if (running) throw new AppError("Another Fusion upload is still running. Wait a minute and try again.", 409)
  return prisma.fusionImport.create({ data: { fileName: fileName.slice(0, 200), uploadedById: user.id } })
}

function clean(v: unknown, max = 120) {
  const s = String(v ?? "").replace(/[​-‍﻿]/g, "").trim()
  return s ? s.slice(0, max) : null
}

export async function importFusionChunk(importId: string, rows: FusionRow[]) {
  const imp = await prisma.fusionImport.findUnique({ where: { id: importId } })
  if (!imp || imp.status !== "RUNNING") throw new AppError("This upload has already finished. Start it again.", 409)
  if (!Array.isArray(rows) || rows.length > FUSION_CHUNK) throw new AppError("Too many rows in one part.")
  // One row per employee ID (the last one wins), skipping rows without an ID or name.
  const byId = new Map<string, FusionRow>()
  let skipped = 0
  for (const r of rows) {
    const empId = clean(r.empId, 20)?.replace(/\.0+$/, "")
    const name = clean(r.name)
    if (!empId || !/^\d{4,15}$/.test(empId) || !name) {
      skipped++
      continue
    }
    byId.set(empId, { ...r, empId, name })
  }
  const list = [...byId.values()]
  if (!list.length) {
    await prisma.fusionImport.update({ where: { id: importId }, data: { rows: { increment: rows.length }, skipped: { increment: skipped } } })
    return { added: 0, updated: 0 }
  }
  const col = <K extends keyof FusionRow>(k: K, max = 120) => list.map((r) => clean(r[k], max))
  const status = list.map((r) => (clean(r.status, 20)?.toUpperCase() === "ACTIVE" ? "ACTIVE" : clean(r.status, 20)?.toUpperCase() || "UNKNOWN"))
  const lwd = list.map((r) => {
    const d = r.lwd ? new Date(r.lwd) : null
    return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
  })
  const [res] = await prisma.$queryRaw<{ added: number; updated: number; deactivated: number; reactivated: number; active: number; resigned: number }[]>`
    WITH input AS (
      SELECT * FROM unnest(
        ${list.map(() => randomUUID())}::text[], ${list.map((r) => r.empId)}::text[], ${list.map((r) => r.name)}::text[], ${status}::text[],
        ${lwd}::text[], ${col("designation")}::text[], ${col("grade", 20)}::text[], ${col("location")}::text[], ${col("department")}::text[]
      ) AS t(new_id, emp_id, name, status, lwd, designation, grade, location, department)
    ),
    prev AS (SELECT e."empId", e.active FROM "Employee" e JOIN input i ON i.emp_id = e."empId"),
    up AS (
      INSERT INTO "Employee" (id, "empId", name, designation, grade, location, department, active, "fusionStatus", "lastWorkingDate", "fusionSeenAt", "createdAt", "updatedAt")
      SELECT new_id, emp_id, name, designation, grade, location, department, status = 'ACTIVE', status, lwd::timestamptz, now(), now(), now() FROM input
      ON CONFLICT ("empId") DO UPDATE SET
        name = EXCLUDED.name,
        designation = coalesce(EXCLUDED.designation, "Employee".designation),
        grade = coalesce(EXCLUDED.grade, "Employee".grade),
        location = coalesce(EXCLUDED.location, "Employee".location),
        department = coalesce(EXCLUDED.department, "Employee".department),
        active = EXCLUDED.active,
        "fusionStatus" = EXCLUDED."fusionStatus",
        "lastWorkingDate" = EXCLUDED."lastWorkingDate",
        "fusionSeenAt" = now(),
        "updatedAt" = now()
      RETURNING "empId", (xmax = 0) AS inserted, active
    )
    SELECT
      count(*) FILTER (WHERE up.inserted)::int AS added,
      count(*) FILTER (WHERE NOT up.inserted)::int AS updated,
      count(*) FILTER (WHERE NOT up.inserted AND NOT up.active AND prev.active)::int AS deactivated,
      count(*) FILTER (WHERE NOT up.inserted AND up.active AND NOT prev.active)::int AS reactivated,
      count(*) FILTER (WHERE up.active)::int AS active,
      count(*) FILTER (WHERE NOT up.active)::int AS resigned
    FROM up LEFT JOIN prev ON prev."empId" = up."empId"`
  await prisma.fusionImport.update({
    where: { id: importId },
    data: {
      rows: { increment: rows.length }, skipped: { increment: skipped }, added: { increment: res.added }, updated: { increment: res.updated },
      deactivated: { increment: res.deactivated }, reactivated: { increment: res.reactivated }, active: { increment: res.active }, resigned: { increment: res.resigned },
    },
  })
  return res
}

export async function finishFusionImport(importId: string, user: SessionUser) {
  const imp = await prisma.fusionImport.update({ where: { id: importId }, data: { status: "DONE", finishedAt: new Date() } })
  await audit(prisma, {
    actorId: user.id, action: "FUSION.IMPORT", entity: "FusionImport", entityId: importId,
    summary: `Fusion report ${imp.fileName}: ${imp.rows} rows, ${imp.active} active, ${imp.resigned} resigned; ${imp.added} new, ${imp.deactivated} newly inactive, ${imp.reactivated} active again${imp.skipped ? `, ${imp.skipped} rows skipped` : ""}`,
  })
  return imp
}

export type FusionDue = { last: Date | null; dueOn: Date | null; daysLeft: number | null; state: "never" | "ok" | "soon" | "overdue" }

/** When the next weekly upload is due, and whether to remind (from day 5) or flag it overdue. */
export async function fusionDue(): Promise<FusionDue> {
  const last = await prisma.fusionImport.findFirst({ where: { status: "DONE" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
  if (!last) return { last: null, dueOn: null, daysLeft: null, state: "never" }
  const dueOn = new Date(last.createdAt.getTime() + FUSION_WEEK_DAYS * 86400_000)
  const daysLeft = Math.ceil((dueOn.getTime() - Date.now()) / 86400_000)
  const age = (Date.now() - last.createdAt.getTime()) / 86400_000
  return { last: last.createdAt, dueOn, daysLeft, state: daysLeft < 0 ? "overdue" : age >= FUSION_REMIND_DAYS ? "soon" : "ok" }
}

/** True once the Fusion report has been uploaded at least once: from then on it is the list of employees. */
export async function fusionIsMaster(tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return (await tx.fusionImport.count({ where: { status: "DONE" } })) > 0
}
