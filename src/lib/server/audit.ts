import "server-only"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

type Tx = Prisma.TransactionClient | typeof prisma

export async function audit(
  tx: Tx,
  entry: {
    actorId?: string | null
    action: string
    entity: string
    entityId?: string | null
    summary: string
    before?: unknown
    after?: unknown
  },
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      before: entry.before === undefined ? undefined : (JSON.parse(JSON.stringify(entry.before)) as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (JSON.parse(JSON.stringify(entry.after)) as Prisma.InputJsonValue),
    },
  })
}
