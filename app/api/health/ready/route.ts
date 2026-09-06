import { redis } from "@/lib/redis"
import { getDb } from "@/lib/db/client"
export const dynamic="force-dynamic"
export async function GET(){try{await getDb()`SELECT 1`;if(!await redis.ping())throw new Error();return Response.json({status:"ready"})}catch{return Response.json({status:"not_ready"},{status:503})}}
