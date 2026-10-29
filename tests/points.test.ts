import { describe, expect, it } from "vitest"
import { applyWithinCap, crossedMilestones, milestoneList, pointsForEvent, progressOf, DEFAULT_RULES } from "@/lib/points"

const R = DEFAULT_RULES // a goodie every 2,000 points up to 20,000

describe("applyWithinCap", () => {
  it("adds points normally", () => expect(applyWithinCap(1500, 400, R.cap)).toEqual({ next: 1900, applied: 400, capped: false }))
  it("stops at the cap and reports how much was applied", () => expect(applyWithinCap(19_800, 600, R.cap)).toEqual({ next: 20_000, applied: 200, capped: true }))
  it("never goes below zero", () => expect(applyWithinCap(300, -500, R.cap)).toEqual({ next: 0, applied: -300, capped: true }))
  it("does nothing at the cap", () => expect(applyWithinCap(20_000, 400, R.cap).applied).toBe(0))
})

describe("crossedMilestones", () => {
  it("finds the milestone crossed by one event", () => expect(crossedMilestones(1900, 2300, R)).toEqual([2000]))
  it("lands exactly on a milestone", () => expect(crossedMilestones(1600, 2000, R)).toEqual([2000]))
  it("finds several milestones from a big adjustment", () => expect(crossedMilestones(1000, 7000, R)).toEqual([2000, 4000, 6000]))
  it("ignores downward moves", () => expect(crossedMilestones(4100, 3900, R)).toEqual([]))
  it("never goes past the cap", () => expect(crossedMilestones(19_000, 25_000, R)).toEqual([20_000]))
  it("doesn't repeat a milestone already passed", () => expect(crossedMilestones(2000, 2400, R)).toEqual([]))
})

describe("milestoneList", () => {
  it("lists 10 milestones for 2,000 up to 20,000", () => expect(milestoneList(R)).toEqual([2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000]))
  it("follows changed rules", () => expect(milestoneList({ step: 2500, cap: 10_000 })).toEqual([2500, 5000, 7500, 10_000]))
})

describe("progressOf", () => {
  it("works out the next milestone and the gap", () => {
    const p = progressOf(7700, R)
    expect(p).toMatchObject({ reached: 3, total: 10, next: 8000, toNext: 300, complete: false, capPercent: 39 })
    expect(p.stepPercent).toBe(85)
  })
  it("starts at zero", () => expect(progressOf(0, R)).toMatchObject({ reached: 0, next: 2000, toNext: 2000, stepPercent: 0 }))
  it("is complete at the cap", () => expect(progressOf(20_000, R)).toMatchObject({ reached: 10, complete: true, next: null, toNext: 0, capPercent: 100 }))
})

describe("pointsForEvent", () => {
  it("uses the event type's points", () => expect(pointsForEvent({ points: null }, { points: 400 })).toBe(400))
  it("uses the event's override when set, even zero", () => {
    expect(pointsForEvent({ points: 1000 }, { points: 600 })).toBe(1000)
    expect(pointsForEvent({ points: 0 }, { points: 600 })).toBe(0)
  })
})
