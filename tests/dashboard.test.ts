import { describe, expect, it } from "vitest"
import { groupFamilies, productFamily } from "@/lib/stock-family"
import { namesMatch } from "@/lib/names"
import { addBusinessDays } from "@/lib/utils"

describe("stock by product", () => {
  it("adds colour variants together: a black and a blue back bag are one Back Bag", () => {
    expect(productFamily("Black Back Bag")).toBe("Back Bag")
    expect(productFamily("Blue Back Bag", "Blue")).toBe("Back Bag")
    expect(productFamily("Mavericks T-Shirt", "Ash")).toBe("Mavericks T-Shirt")
    const rows = groupFamilies([
      { product: "Black Back Bag", color: null, openingQty: 50, receivedQty: 10, availableQty: 30, distributedQty: 30 },
      { product: "Blue Back Bag", color: "Blue", openingQty: 200, receivedQty: 0, availableQty: 169, distributedQty: 31 },
      { product: "Jute Bag", color: null, openingQty: 60, receivedQty: 0, availableQty: 56, distributedQty: 4 },
    ])
    expect(rows.find((r) => r.family === "Back Bag")).toEqual({ family: "Back Bag", variants: 2, procured: 260, inStock: 199, distributed: 61 })
    expect(rows.find((r) => r.family === "Jute Bag")?.variants).toBe(1)
  })
})

describe("QR desk name check", () => {
  it("accepts short forms of the Fusion name and flags a different name", () => {
    expect(namesMatch("Priya S", "Priyanka Sharma")).toBe(true)
    expect(namesMatch("priyanka", "Priyanka Sharma")).toBe(true)
    expect(namesMatch("Rahul Verma", "Priyanka Sharma")).toBe(false)
  })
})

describe("20 business days", () => {
  it("skips weekends", () => {
    // Monday 2 Nov 2026 + 20 working days = Monday 30 Nov 2026
    expect(addBusinessDays(new Date(2026, 10, 2), 20).toDateString()).toBe(new Date(2026, 10, 30).toDateString())
    // Friday + 1 = Monday
    expect(addBusinessDays(new Date(2026, 10, 6), 1).getDay()).toBe(1)
  })
})
