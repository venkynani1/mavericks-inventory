"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { run } from "@/lib/server/action"
import { audit } from "@/lib/server/audit"
import { AppError, assertPermission, getUser } from "@/lib/server/session"
import { nextRequestNumber, nextStockCode, recomputeTotals } from "@/lib/server/workflow"

const itemSchema = z.object({
  code: z.string().trim().max(40).regex(/^[A-Za-z0-9._/-]*$/, "Use letters, numbers, dot, dash or slash").optional().or(z.literal("")),
  name: z.string().trim().min(3, "Enter a stock name").max(160),
  product: z.string().trim().min(2, "Enter the product").max(100),
  categoryId: z.string().min(1, "Choose a category"),
  size: z.string().trim().max(30).optional(),
  color: z.string().trim().max(30).optional(),
  brand: z.string().trim().max(60).optional(),
  unit: z.string().trim().min(1).max(20).default("Nos"),
  location: z.string().trim().max(60).optional(),
  unitCost: z.coerce.number().min(0, "Cost can't be negative").optional().or(z.literal("")),
  reorderLevel: z.coerce.number().int().min(0).default(0),
  openingQty: z.coerce.number().int("Use a whole number").min(0, "Can't be negative"),
})
export type StockItemInput = z.input<typeof itemSchema>

const blank = (s?: string | null) => (s && s.trim() ? s.trim() : null)

function parse(input: StockItemInput) {
  const r = itemSchema.safeParse(input)
  if (!r.success) {
    const i = r.error.issues[0]
    throw new AppError(`${i.path.join(".") ? i.path.join(".") + ": " : ""}${i.message}`)
  }
  return r.data
}

/** Adds a single item to the executive's open "manual entry" stock master draft (or starts one). */
export async function createStockItem(input: StockItemInput) {
  return run(async () => {
    const user = await assertPermission("stock:write")
    const v = parse(input)
    const res = await prisma.$transaction(async (tx) => {
      if (v.code && (await tx.stockItem.findFirst({ where: { code: { equals: v.code, mode: "insensitive" } } })))
        throw new AppError(`Stock code ${v.code} is already in use.`)
      if (await tx.stockItem.findFirst({ where: { name: { equals: v.name, mode: "insensitive" }, status: { not: "INACTIVE" } } }))
        throw new AppError("An item with this name already exists.")
      let req = await tx.request.findFirst({
        where: { type: "STOCK_MASTER", status: "DRAFT", createdById: user.id, uploadBatchId: null },
        orderBy: { createdAt: "desc" },
      })
      if (!req) {
        req = await tx.request.create({
          data: { number: await nextRequestNumber(tx, "STOCK_MASTER"), type: "STOCK_MASTER", title: "New stock items", createdById: user.id },
        })
      }
      const item = await tx.stockItem.create({
        data: {
          code: v.code || (await nextStockCode(tx)),
          name: v.name,
          product: v.product,
          categoryId: v.categoryId,
          size: blank(v.size),
          color: blank(v.color),
          brand: blank(v.brand),
          unit: v.unit,
          location: blank(v.location),
          unitCost: v.unitCost === "" || v.unitCost === undefined ? null : v.unitCost,
          reorderLevel: v.reorderLevel,
          openingQty: v.openingQty,
          status: "DRAFT",
          createdById: user.id,
          requestId: req.id,
        },
      })
      await recomputeTotals(tx, req.id)
      await audit(tx, { actorId: user.id, action: "STOCK_ITEM.CREATE", entity: "StockItem", entityId: item.id, summary: `Added ${item.code} ${item.name} to draft ${req.number}`, after: item })
      return { requestId: req.id, number: req.number }
    })
    revalidatePath("/stock")
    return res
  }, "Item added to draft")
}

export async function updateStockItem(id: string, input: StockItemInput) {
  return run(async () => {
    const user = await getUser()
    if (!user) throw new AppError("Sign in again.")
    const v = parse(input)
    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id }, include: { request: true } })
      if (!item || item.status === "INACTIVE") throw new AppError("Stock item not found.")
      const isDraftOwner =
        item.status === "DRAFT" && user.role === "EXECUTIVE" && item.createdById === user.id && ["DRAFT", "REJECTED"].includes(item.request?.status ?? "")
      const isAdmin = user.role === "ADMIN"
      if (!isDraftOwner && !isAdmin)
        throw new AppError(item.status === "ACTIVE" ? "Approved items can only be changed by an administrator." : "Only the creator can edit this draft while it isn't under review.")
      if (v.code && v.code.toLowerCase() !== item.code.toLowerCase() && (await tx.stockItem.findFirst({ where: { code: { equals: v.code, mode: "insensitive" } } })))
        throw new AppError(`Stock code ${v.code} is already in use.`)
      const data = {
        code: v.code || item.code,
        name: v.name,
        product: v.product,
        categoryId: v.categoryId,
        size: blank(v.size),
        color: blank(v.color),
        brand: blank(v.brand),
        unit: v.unit,
        location: blank(v.location),
        unitCost: v.unitCost === "" || v.unitCost === undefined ? null : v.unitCost,
        reorderLevel: v.reorderLevel,
        // Quantities only move through approved transactions; opening qty is editable while the item is a draft.
        ...(item.status === "DRAFT" ? { openingQty: v.openingQty } : {}),
      }
      const after = await tx.stockItem.update({ where: { id }, data })
      if (item.requestId && item.status === "DRAFT") await recomputeTotals(tx, item.requestId)
      await audit(tx, {
        actorId: user.id,
        action: isAdmin && item.status === "ACTIVE" ? "STOCK_ITEM.ADMIN_OVERRIDE" : "STOCK_ITEM.UPDATE",
        entity: "StockItem",
        entityId: id,
        summary: `Updated ${after.code} ${after.name}${isAdmin && item.status === "ACTIVE" ? " (admin override)" : ""}`,
        before: item,
        after,
      })
    })
    revalidatePath("/stock")
    revalidatePath(`/stock/${id}`)
  }, "Item saved")
}

/** Logical delete. Draft items: creator. Active items: admin, and only if no transactions reference them. */
export async function deleteStockItem(id: string) {
  return run(async () => {
    const user = await getUser()
    if (!user) throw new AppError("Sign in again.")
    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id }, include: { request: true, _count: { select: { distributionLines: true, receiptLines: true } } } })
      if (!item || item.status === "INACTIVE") throw new AppError("Stock item not found.")
      if (item.status === "DRAFT") {
        if (item.createdById !== user.id || !["DRAFT", "REJECTED"].includes(item.request?.status ?? ""))
          throw new AppError("Only the creator can remove a draft item while it isn't under review.")
      } else {
        if (user.role !== "ADMIN") throw new AppError("Only an administrator can deactivate an approved item.")
        if (item._count.distributionLines + item._count.receiptLines > 0)
          throw new AppError("This item has transaction history, so it can't be deleted. Its records must stay for audit.")
        if (item.availableQty > 0) throw new AppError(`This item still has ${item.availableQty} units in stock.`)
      }
      await tx.stockItem.update({ where: { id }, data: { status: "INACTIVE", deletedAt: new Date() } })
      if (item.requestId && item.status === "DRAFT") await recomputeTotals(tx, item.requestId)
      await audit(tx, { actorId: user.id, action: "STOCK_ITEM.DELETE", entity: "StockItem", entityId: id, summary: `Deleted ${item.code} ${item.name} (logical delete)`, before: item })
    })
    revalidatePath("/stock")
  }, "Item deleted")
}
