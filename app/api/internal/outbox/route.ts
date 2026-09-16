import { timingSafeEqual } from "node:crypto"
import { flushOutbox } from "@/lib/data/events"
import { flushInvitationEmails } from "@/lib/data/invitation-emails"
import { deleteExpiredAiOperations } from "@/lib/data/ai-operations"
export const dynamic="force-dynamic"
export async function POST(request:Request){
  const secret=process.env.CRON_SECRET
  const header=request.headers.get("authorization") ?? ""
  if(!secret || secret.length<32)return Response.json({error:"Worker not configured"},{status:503})
  const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(header)
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:"Unauthorized"},{status:401})
  const outbox = await flushOutbox(); const invitations = await flushInvitationEmails()
  try { await deleteExpiredAiOperations() } catch { console.warn("[Saathi] AI operation retention cleanup deferred") }
  const degraded = outbox.unavailable || outbox.failed > 0 || invitations.unavailable || invitations.failed > 0
  return Response.json({ status: degraded ? "deferred" : "ok", outbox, invitations }, { status: degraded ? 503 : 200 })
}
