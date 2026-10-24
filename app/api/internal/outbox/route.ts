import { timingSafeEqual } from "node:crypto"
import { flushOutbox } from "@/lib/data/events"
import { deleteExpiredAiOperations } from "@/lib/data/ai-operations"
import { deleteExpiredPublishedOutbox } from "@/lib/data/retention"
export const dynamic="force-dynamic"
export async function POST(request:Request){
  const secret=process.env.CRON_SECRET
  const header=request.headers.get("authorization") ?? ""
  if(!secret || secret.length<32)return Response.json({error:"Worker not configured"},{status:503})
  const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(header)
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:"Unauthorized"},{status:401})
  const outbox = await flushOutbox()
  try { await deleteExpiredAiOperations() } catch { console.warn("[Saathi] AI operation retention cleanup deferred") }
  let retentionDeferred = false
  try { await deleteExpiredPublishedOutbox() } catch { retentionDeferred = true; console.warn("[Saathi] Outbox retention cleanup deferred") }
  const degraded = retentionDeferred || outbox.unavailable || outbox.failed > 0
  return Response.json({ status: degraded ? "deferred" : "ok", outbox }, { status: degraded ? 503 : 200 })
}
