import "server-only"
import { prisma } from "@/lib/db"

export type WorkflowSettings = {
  /** 1 = Manager approval only, 2 = Manager then Management Authority */
  approvalLevels: 1 | 2
  /** Block submissions/approvals that would take available stock below zero */
  preventNegativeStock: boolean
  /** Requests waiting longer than this many hours are flagged as overdue */
  escalationHours: number
  /** Apply level-2 approval only when a request's total quantity reaches this number (0 = always) */
  level2Threshold: number
}

export const DEFAULT_SETTINGS: WorkflowSettings = {
  approvalLevels: 1,
  preventNegativeStock: true,
  escalationHours: 48,
  level2Threshold: 0,
}

export async function getSettings(): Promise<WorkflowSettings> {
  const rows = await prisma.setting.findMany()
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    approvalLevels: map.approvalLevels === "2" ? 2 : 1,
    preventNegativeStock: map.preventNegativeStock ? map.preventNegativeStock === "true" : DEFAULT_SETTINGS.preventNegativeStock,
    escalationHours: Number(map.escalationHours ?? DEFAULT_SETTINGS.escalationHours) || DEFAULT_SETTINGS.escalationHours,
    level2Threshold: Number(map.level2Threshold ?? 0) || 0,
  }
}

/** Number of approval levels a request of this size needs. */
export function levelsFor(settings: WorkflowSettings, totalQty: number) {
  if (settings.approvalLevels === 1) return 1
  if (settings.level2Threshold > 0 && totalQty < settings.level2Threshold) return 1
  return 2
}
