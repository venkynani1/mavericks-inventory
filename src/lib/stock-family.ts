/**
 * Groups stock items into product families for the dashboard: colour variants count as one product
 * (a black back bag and a blue back bag are both "Back Bag"). Sizes stay inside the family too.
 */
const COLOURS = [
  "sky blue", "navy blue", "dark blue", "light blue", "royal blue", "dark grey", "light grey",
  "black", "blue", "navy", "red", "white", "grey", "gray", "green", "yellow", "orange", "pink", "purple",
  "maroon", "brown", "ash", "beige", "cream", "olive", "teal", "silver", "gold", "violet", "multicolour", "multicolor",
]
const RE = new RegExp(`\\b(${COLOURS.map((c) => c.replace(" ", "\\s+")).join("|")})\\b`, "gi")

export function productFamily(product: string, color?: string | null) {
  let p = product
  if (color?.trim()) p = p.replace(new RegExp(`\\b${color.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ")
  p = p.replace(RE, " ").replace(/\s*-\s*$/g, "").replace(/^\s*-\s*/g, "").replace(/\s{2,}/g, " ").trim()
  if (!p) p = product.trim()
  // Same family whatever the capitalisation ("BOT ALL COFFEE MUG" and "Bot All Coffee Mug").
  return p.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export type FamilyRow = { family: string; variants: number; procured: number; inStock: number; distributed: number }

export function groupFamilies(items: { product: string; color: string | null; openingQty: number; receivedQty: number; availableQty: number; distributedQty: number }[]): FamilyRow[] {
  const map = new Map<string, FamilyRow>()
  for (const i of items) {
    const f = productFamily(i.product, i.color)
    const r = map.get(f) ?? { family: f, variants: 0, procured: 0, inStock: 0, distributed: 0 }
    r.variants += 1
    r.procured += i.openingQty + i.receivedQty
    r.inStock += i.availableQty
    r.distributed += i.distributedQty
    map.set(f, r)
  }
  return [...map.values()].sort((a, b) => b.procured - a.procured)
}
