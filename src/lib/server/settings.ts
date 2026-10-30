import "server-only"
import { memo } from "./memo"
import { prisma } from "@/lib/db"
import { DEFAULT_RULES, type RewardRules } from "@/lib/points"

export type WorkflowSettings = {
  /** 1 = Manager approval only, 2 = Manager then Management Authority */
  approvalLevels: 1 | 2
  /** Block submissions/approvals that would take available stock below zero */
  preventNegativeStock: boolean
  /** Requests waiting longer than this many hours are flagged as overdue */
  escalationHours: number
  /** Apply level-2 approval only when a request's total quantity reaches this number (0 = always) */
  level2Threshold: number
  /** Points rewards: a milestone every `step` points up to `cap` */
  rewards: RewardRules
  /** Employees see the top-10 leaderboard in their portal */
  leaderboardForEmployees: boolean
}

export const DEFAULT_SETTINGS: WorkflowSettings = {
  approvalLevels: 1,
  preventNegativeStock: true,
  escalationHours: 48,
  level2Threshold: 0,
  rewards: DEFAULT_RULES,
  leaderboardForEmployees: true,
}

export const SETTINGS_TAG = "settings"

async function readSettings(): Promise<WorkflowSettings> {
  const rows = await prisma.setting.findMany()
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const step = Number(map.rewardStep) || DEFAULT_RULES.step
  const cap = Number(map.rewardCap) || DEFAULT_RULES.cap
  return {
    approvalLevels: map.approvalLevels === "2" ? 2 : 1,
    preventNegativeStock: map.preventNegativeStock ? map.preventNegativeStock === "true" : DEFAULT_SETTINGS.preventNegativeStock,
    escalationHours: Number(map.escalationHours ?? DEFAULT_SETTINGS.escalationHours) || DEFAULT_SETTINGS.escalationHours,
    level2Threshold: Number(map.level2Threshold ?? 0) || 0,
    rewards: { step, cap: Math.max(step, cap) },
    leaderboardForEmployees: map.leaderboardForEmployees ? map.leaderboardForEmployees === "true" : true,
  }
}

export function getSettings(): Promise<WorkflowSettings> {
  return memo(SETTINGS_TAG, 60_000, readSettings)
}

/** Number of approval levels a request of this size needs. */
export function levelsFor(settings: WorkflowSettings, totalQty: number) {
  if (settings.approvalLevels === 1) return 1
  if (settings.level2Threshold > 0 && totalQty < settings.level2Threshold) return 1
  return 2
}
