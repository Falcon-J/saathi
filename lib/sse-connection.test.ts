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

test("a concurrent burst admits the available slots instead of rejecting every connection", async () => {
  const options = { userId: `sse-burst-${randomUUID()}@example.test`, maxConnections: 5, leaseSeconds: 60, maxAttempts: 300, attemptWindowMs: 60_000 }
  const outcomes = await Promise.allSettled(Array.from({ length: 200 }, () => acquireSseConnectionLease(options)))
  const admitted = outcomes.filter(result => result.status === "fulfilled")
  assert.equal(admitted.length, 5)
  assert.equal(outcomes.filter(result => result.status === "rejected" && result.reason instanceof SseConnectionLimitExceeded).length, 195)
  for (const result of admitted) if (result.status === "fulfilled") await result.value()
})
