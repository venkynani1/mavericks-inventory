"use server"

import { revalidatePath } from "next/cache"
import { run } from "@/lib/server/action"
import { finishFusionImport, importFusionChunk, startFusionImport, type FusionRow } from "@/lib/server/fusion"
import { AppError, requireUser } from "@/lib/server/session"
import { can } from "@/lib/roles"

async function uploader() {
  const user = await requireUser()
  if (!can(user.role, "rewards:operate") && !can(user.role, "admin:manage")) throw new AppError("Only the engagement team or an administrator can upload the Fusion report.", 403)
  return user
}

export async function fusionStart(fileName: string) {
  return run(async () => {
    const user = await uploader()
    const imp = await startFusionImport(fileName, user)
    return { id: imp.id }
  })
}

export async function fusionChunk(importId: string, rows: FusionRow[]) {
  return run(async () => {
    await uploader()
    return importFusionChunk(importId, rows)
  })
}

export async function fusionFinish(importId: string) {
  return run(async () => {
    const user = await uploader()
    const imp = await finishFusionImport(importId, user)
    for (const p of ["/employees", "/", "/leaderboard"]) revalidatePath(p)
    return { rows: imp.rows, active: imp.active, resigned: imp.resigned, added: imp.added, deactivated: imp.deactivated, reactivated: imp.reactivated, skipped: imp.skipped }
  })
}
