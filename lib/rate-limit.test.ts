import assert from "node:assert/strict"
import test from "node:test"
import { consumeDistributedRateLimit, RateLimitExceeded } from "./rate-limit.ts"

test("enforces a distributed request limit with Redis state", async () => {
  const key = `test-rate-limit-${Date.now()}-${Math.random()}`

  await consumeDistributedRateLimit(key, 1, 60_000)

  await assert.rejects(
    () => consumeDistributedRateLimit(key, 1, 60_000),
    (error: unknown) => error instanceof RateLimitExceeded,
  )
})

test("allows the first request in a new fixed window", async () => {
  const key = `test-rate-limit-new-${Date.now()}-${Math.random()}`

  await assert.doesNotReject(() => consumeDistributedRateLimit(key, 1, 60_000))
})
