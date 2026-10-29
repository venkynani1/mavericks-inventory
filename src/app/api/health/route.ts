import { prisma } from "@/lib/db"
import { appLocation, dbLatency, dbLocation } from "@/lib/server/system"

export const dynamic = "force-dynamic"

/**
 * Liveness/readiness probe for App Service, App Runner, ECS or uptime monitors.
 * Also reports where the app and database run, and the database round trip, to diagnose slowness.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    const latencyMs = await dbLatency(3)
    const app = appLocation()
    const db = dbLocation()
    return Response.json({ status: "ok", db: "ok", time: new Date().toISOString(), latencyMs, appRegion: app.region, dbProvider: db.provider, dbRegion: db.region })
  } catch {
    return Response.json({ status: "degraded", db: "unreachable", error: { code: "DATABASE_UNREACHABLE", message: "The database can't be reached." } }, { status: 503 })
  }
}
