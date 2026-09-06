import test from "node:test"
import assert from "node:assert/strict"
import { Webhook } from "svix"
import { verifyEmailWebhook, nextDeliveryStatus } from "./email-webhook.ts"

test("signed webhook accepts exact body and rejects tampering", () => {
  const secret = Buffer.alloc(32, 7).toString("base64"), time = new Date()
  const body = JSON.stringify({ type: "email.bounced", data: { email_id: "provider-id" } })
  const headers = { "svix-id": "test-message", "svix-timestamp": String(Math.floor(time.getTime()/1000)), "svix-signature": new Webhook(secret).sign("test-message", time, body) }
  assert.equal(verifyEmailWebhook(body, headers, secret).success, true)
  assert.throws(() => verifyEmailWebhook(body.replace("bounced", "delivered"), headers, secret))
})
test("late delivery cannot erase a bounce or complaint", () => {
  assert.equal(nextDeliveryStatus("bounced", "delivered"), "bounced")
  assert.equal(nextDeliveryStatus("delivered", "complained"), "complained")
})
