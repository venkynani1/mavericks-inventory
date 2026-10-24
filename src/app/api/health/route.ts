import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

/** Liveness/readiness probe for App Service, App Runner, ECS or uptime monitors. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: "ok", db: "ok", time: new Date().toISOString() })
  } catch {
    return Response.json({ status: "degraded", db: "unreachable" }, { status: 503 })
  }
}
