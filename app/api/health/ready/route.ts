import { redis } from "@/lib/redis"
import { getDb } from "@/lib/db/client"
export const dynamic = "force-dynamic"

export async function GET() {
  let dependency = "database"
  try {
    await getDb()`SELECT 1`
    dependency = "redis"
    if (!await redis.ping()) throw new Error()
    return Response.json({ status: "ready" })
  } catch {
    console.error("[Saathi] Readiness dependency failed:", dependency)
    return Response.json({ status: "not_ready" }, { status: 503 })
  }
}
