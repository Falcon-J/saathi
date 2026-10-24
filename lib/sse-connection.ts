import crypto from "crypto"
import { redis } from "./redis.ts"
import { consumeDistributedRateLimit, RateLimitExceeded } from "./rate-limit.ts"

export class SseConnectionLimitExceeded extends Error {
  readonly retryAfterSeconds = 30

  constructor() {
    super("Too many active realtime connections")
    this.name = "SseConnectionLimitExceeded"
  }
}

function scopeKey(userId: string): string {
  return crypto.createHash("sha256").update(userId.trim().toLowerCase()).digest("hex").slice(0, 16)
}

export async function acquireSseConnectionLease(options: {
  userId: string
  maxConnections: number
  leaseSeconds: number
  maxAttempts: number
  attemptWindowMs: number
}): Promise<() => Promise<void>> {
  await consumeDistributedRateLimit(
    `sse-attempt:${options.userId}`,
    options.maxAttempts,
    options.attemptWindowMs,
  )

  const scope = scopeKey(options.userId)
  const leaseId = crypto.randomUUID()
  const activeKey = `sse:connections:v2:${scope}`
  const claimed = await redis.claimSseLease(activeKey, leaseId, options.maxConnections, options.leaseSeconds)
  if (!claimed) throw new SseConnectionLimitExceeded()

  let released = false
  return async () => {
    if (released) return
    released = true
    await redis.releaseSseLease(activeKey, leaseId)
  }
}

export { RateLimitExceeded }
