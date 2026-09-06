import { getDb } from "@/lib/db/client"
import { verifyEmailWebhook, nextDeliveryStatus } from "@/lib/email-webhook"

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return Response.json({ error: "Webhook not configured" }, { status: 503 })
  const body = await request.text()
  if (Buffer.byteLength(body) > 65536) return new Response(null, { status: 413 })
  let event
  const id = request.headers.get("svix-id") ?? ""
  try {
    event = verifyEmailWebhook(body, {
      "svix-id": id, "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    }, secret)
  } catch { return Response.json({ error: "Invalid signature" }, { status: 400 }) }
  if (!event.success) return new Response(null, { status: 204 })
  const data = event.data
  try {
    await getDb().begin(async tx => {
      if ((await tx`SELECT id FROM email_webhook_events WHERE id=${id}`).length) return
      const [email] = await tx`SELECT * FROM invitation_emails WHERE provider_id=${data.data.email_id} FOR UPDATE`
      // A provider callback may arrive before the send transaction commits. Request retry.
      if (!email) throw new Error("Provider message not yet recorded")
      const status = nextDeliveryStatus(email.delivery_status, data.type.slice(6))
      await tx`UPDATE invitation_emails SET delivery_status=${status} WHERE id=${email.id}`
      if (status === "bounced" || status === "complained") {
        const recipient = String(email.payload.to[0]).trim().toLowerCase()
        await tx`INSERT INTO email_suppressions(email,reason) VALUES(${recipient},${status}) ON CONFLICT(email) DO NOTHING`
      }
      await tx`INSERT INTO email_webhook_events(id,provider_id,event_type) VALUES(${id},${data.data.email_id},${data.type}) ON CONFLICT DO NOTHING`
    })
    return new Response(null, { status: 204 })
  } catch { return Response.json({ error: "Processing unavailable; retry required" }, { status: 503 }) }
}
