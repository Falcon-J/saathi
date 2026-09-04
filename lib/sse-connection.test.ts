import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { acquireSseConnectionLease, SseConnectionLimitExceeded } from "./sse-connection.ts"

test("limits concurrent SSE leases and releases them exactly once", async () => {
  const userId = `sse-test-${randomUUID()}@example.com`
  const options = {
    userId,
    maxConnections: 1,
    leaseSeconds: 60,
    maxAttempts: 10,
    attemptWindowMs: 60_000,
  }

  const release = await acquireSseConnectionLease(options)
  await assert.rejects(() => acquireSseConnectionLease(options), SseConnectionLimitExceeded)

  await release()
  await release()
  const secondRelease = await acquireSseConnectionLease(options)
  await secondRelease()
})
