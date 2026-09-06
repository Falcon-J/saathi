import { getDb } from "../db/client.ts"
import { deliverInvitationEmail, mayRetryEmail } from "../email-delivery.ts"

/** Bounded durable delivery. Never reinterpret provider acceptance as inbox delivery. */
export async function flushInvitationEmails(): Promise<{ sent: number; failed: number; unavailable: boolean }> {
  const result = { sent: 0, failed: 0, unavailable: false }
  const key = process.env.RESEND_API_KEY
  if (!key) return { ...result, unavailable: true }
  try {
    const db = getDb()
    const pending = await db`SELECT id,invitation_id FROM invitation_emails WHERE status='queued' AND next_attempt_at<=now() ORDER BY created_at LIMIT 5`
    for (const job of pending) {
      // Commit before contacting provider. A process crash cannot reset the safe retry window.
      await db`UPDATE invitation_emails SET first_attempt_at=COALESCE(first_attempt_at,now()) WHERE id=${job.id}`
      await db.begin(async tx => {
        // Same lock order as acceptance/revocation: invitation, then email.
        const [invite] = await tx`SELECT status,expires_at FROM workspace_invitations WHERE id=${job.invitation_id} FOR UPDATE`
        const [row] = await tx`SELECT * FROM invitation_emails WHERE id=${job.id} AND status='queued' AND next_attempt_at<=now() FOR UPDATE SKIP LOCKED`
        if (!row) return
        if (!invite || invite.status!=='pending' || new Date(invite.expires_at).getTime()<=Date.now()) {
          await tx`UPDATE invitation_emails SET status='cancelled' WHERE id=${row.id}`
          return
        }
        const [suppressed] = await tx`SELECT email FROM email_suppressions WHERE email=${String(row.payload.to[0]).toLowerCase()}`
        if (suppressed || !mayRetryEmail(row.first_attempt_at) || row.attempts>=10) {
          await tx`UPDATE invitation_emails SET status='failed',error_category=${suppressed?'SUPPRESSED':'MANUAL_REVIEW_REQUIRED'} WHERE id=${row.id}`
          result.failed++
          return
        }
        const delivered = await deliverInvitationEmail(row.id,row.payload,key)
        await tx`UPDATE invitation_emails SET status=${delivered.status==='retry'?'queued':delivered.status},attempts=attempts+1,
          provider_id=${delivered.status==='sent'?delivered.providerId:null},error_category=${delivered.status==='sent'?null:delivered.category},
          next_attempt_at=now()+(${Math.min(3600,30*2**row.attempts)} * interval '1 second') WHERE id=${row.id}`
        if (delivered.status==='sent') result.sent++
        else { result.failed++; result.unavailable ||= delivered.status==='retry' }
      })
    }
  } catch { result.unavailable = true }
  return result
}
