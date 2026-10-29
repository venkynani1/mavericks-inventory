// Points rules, kept free of database code so they can be unit-tested (see tests/points.test.ts).

export type RewardRules = { step: number; cap: number }

export const DEFAULT_RULES: RewardRules = { step: 2000, cap: 20000 }

/** Applies a change within 0..cap. Returns the new balance and how much was actually applied. */
export function applyWithinCap(current: number, delta: number, cap: number) {
  const next = Math.max(0, Math.min(cap, current + delta))
  return { next, applied: next - current, capped: next - current !== delta }
}

/** Milestones passed when moving from `before` to `after` (only upward moves earn milestones). */
export function crossedMilestones(before: number, after: number, rules: RewardRules) {
  const out: number[] = []
  if (after <= before) return out
  for (let t = rules.step; t <= rules.cap; t += rules.step) if (t > before && t <= after) out.push(t)
  return out
}

/** All milestone thresholds, e.g. [2000, 4000, … 20000]. */
export function milestoneList(rules: RewardRules) {
  const out: number[] = []
  for (let t = rules.step; t <= rules.cap; t += rules.step) out.push(t)
  return out
}

/** Where someone stands: milestones reached, the next one and progress towards it. */
export function progressOf(points: number, rules: RewardRules) {
  const p = Math.max(0, Math.min(points, rules.cap))
  const reached = Math.floor(p / rules.step)
  const total = Math.floor(rules.cap / rules.step)
  const complete = p >= rules.cap
  const next = complete ? null : (reached + 1) * rules.step
  const prev = reached * rules.step
  return {
    points: p,
    reached,
    total,
    complete,
    next,
    toNext: next === null ? 0 : next - p,
    /** 0..100 progress inside the current step */
    stepPercent: complete ? 100 : Math.round(((p - prev) / rules.step) * 100),
    /** 0..100 progress towards the cap */
    capPercent: Math.round((p / rules.cap) * 100),
  }
}

/** Points an attendee gets for an event: the event's own value if set, else its type's value. */
export function pointsForEvent(event: { points: number | null }, type: { points: number }) {
  return event.points ?? type.points
}
