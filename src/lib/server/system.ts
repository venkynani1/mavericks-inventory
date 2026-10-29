import "server-only"
import { prisma } from "@/lib/db"

/*
 * Where the app and the database are running, and how far apart they are. Most "the app is slow"
 * reports on serverless hosting come from the app and the database being in different regions:
 * every query then crosses an ocean, and a page makes several queries.
 */

// Vercel function regions → the cloud region they sit in.
const VERCEL: Record<string, { cloud: string; city: string }> = {
  iad1: { cloud: "us-east-1", city: "Washington, D.C." },
  cle1: { cloud: "us-east-2", city: "Cleveland" },
  pdx1: { cloud: "us-west-2", city: "Portland" },
  sfo1: { cloud: "us-west-1", city: "San Francisco" },
  bom1: { cloud: "ap-south-1", city: "Mumbai" },
  sin1: { cloud: "ap-southeast-1", city: "Singapore" },
  hnd1: { cloud: "ap-northeast-1", city: "Tokyo" },
  icn1: { cloud: "ap-northeast-2", city: "Seoul" },
  kix1: { cloud: "ap-northeast-3", city: "Osaka" },
  syd1: { cloud: "ap-southeast-2", city: "Sydney" },
  fra1: { cloud: "eu-central-1", city: "Frankfurt" },
  dub1: { cloud: "eu-west-1", city: "Dublin" },
  lhr1: { cloud: "eu-west-2", city: "London" },
  cdg1: { cloud: "eu-west-3", city: "Paris" },
  arn1: { cloud: "eu-north-1", city: "Stockholm" },
  gru1: { cloud: "sa-east-1", city: "São Paulo" },
  cpt1: { cloud: "af-south-1", city: "Cape Town" },
  dxb1: { cloud: "me-central-1", city: "Dubai" },
  yul1: { cloud: "ca-central-1", city: "Montréal" },
}
const toVercel = (cloud: string) => Object.entries(VERCEL).find(([, v]) => v.cloud === cloud)?.[0]

export function dbLocation(url = process.env.DATABASE_URL ?? "") {
  let host = ""
  try {
    host = new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname
  } catch {
    return { host: "unknown", provider: "unknown", region: null as string | null }
  }
  const neon = host.match(/\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech$/) ?? host.match(/\.([a-z]+\d?)\.azure\.neon\.tech$/)
  if (neon) return { host, provider: "Neon", region: neon[1] }
  const rds = host.match(/\.([a-z]{2}-[a-z]+-\d)\.rds\.amazonaws\.com$/)
  if (rds) return { host, provider: "Amazon RDS / Aurora", region: rds[1] }
  if (host.endsWith(".postgres.database.azure.com")) return { host, provider: "Azure Database for PostgreSQL", region: null }
  if (host.includes("supabase")) return { host, provider: "Supabase", region: host.match(/aws-0-([a-z]{2}-[a-z]+-\d)/)?.[1] ?? null }
  if (["localhost", "127.0.0.1", "db", "postgres"].includes(host)) return { host, provider: "Local / same network", region: "local" }
  return { host, provider: "PostgreSQL", region: null }
}

export function appLocation() {
  const vr = process.env.VERCEL_REGION
  if (vr) return { host: "Vercel", region: vr, cloud: VERCEL[vr]?.cloud ?? null, city: VERCEL[vr]?.city ?? null }
  if (process.env.REGION_NAME) return { host: "Azure App Service", region: process.env.REGION_NAME, cloud: null, city: null }
  if (process.env.AWS_REGION) return { host: "AWS", region: process.env.AWS_REGION, cloud: process.env.AWS_REGION, city: null }
  return { host: process.env.WEBSITE_SITE_NAME ? "Azure" : "Server", region: null as string | null, cloud: null as string | null, city: null as string | null }
}

/** Median round trip of a trivial query, in milliseconds. */
export async function dbLatency(samples = 5) {
  const times: number[] = []
  await prisma.$queryRaw`SELECT 1`
  for (let i = 0; i < samples; i++) {
    const t = performance.now()
    await prisma.$queryRaw`SELECT 1`
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  return Math.round(times[Math.floor(times.length / 2)])
}

export async function systemReport() {
  const app = appLocation()
  const db = dbLocation()
  let latencyMs: number | null = null
  let dbOk = true
  try {
    latencyMs = await dbLatency()
  } catch {
    dbOk = false
  }
  const sameRegion = app.cloud && db.region ? app.cloud === db.region : null
  const advice: string[] = []
  if (latencyMs !== null && latencyMs > 25) {
    advice.push(`Each database query takes about ${latencyMs} ms. A page makes 3 to 8 queries, so pages wait roughly ${latencyMs * 4} to ${latencyMs * 8} ms on the database alone.`)
    if (app.host === "Vercel" && db.region) {
      const best = toVercel(db.region)
      advice.push(best ? `Move the functions next to the database: Vercel project, Settings, Functions, Function Region: choose ${best} (${VERCEL[best].city}). Then redeploy.` : `Choose the Vercel function region closest to the database region ${db.region}.`)
    } else advice.push("Run the app and the database in the same region (and the same virtual network on Azure or AWS).")
  }
  return { app, db, latencyMs, dbOk, sameRegion, advice, node: process.version, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_COMMIT ?? null }
}
