import { Webhook } from "svix"
import { z } from "zod"

const eventSchema = z.object({
  type: z.enum(["email.delivered", "email.bounced", "email.complained", "email.failed"]),
  data: z.object({ email_id: z.string().min(1) }),
})

export function verifyEmailWebhook(body: string, headers: Record<string, string>, secret: string) {
  new Webhook(secret).verify(body, headers)
  return eventSchema.safeParse(JSON.parse(body))
}

export function nextDeliveryStatus(current: string | null, incoming: string): string {
  const rank: Record<string, number> = { delivered: 1, failed: 2, bounced: 3, complained: 4 }
  return (rank[current ?? ""] ?? 0) > (rank[incoming] ?? 0) ? current! : incoming
}
