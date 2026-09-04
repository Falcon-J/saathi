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
  const leaseKey = `sse:lease:${scope}:${leaseId}`
  const activeKey = `sse:leases:${scope}`
  const claimed = await redis.setIfAbsent(leaseKey, leaseId, { ex: options.leaseSeconds })
  if (!claimed) throw new SseConnectionLimitExceeded()

  await redis.sadd(activeKey, leaseId)
  const leaseIds = await redis.smembers(activeKey)
  const liveLeaseIds: string[] = []
  for (const id of leaseIds) {
    const live = await redis.get(`sse:lease:${scope}:${id}`)
    if (live) {
      liveLeaseIds.push(id)
    } else {
      await redis.srem(activeKey, id)
    }
  }

  if (liveLeaseIds.length > options.maxConnections) {
    await redis.del(leaseKey)
    await redis.srem(activeKey, leaseId)
    throw new SseConnectionLimitExceeded()
  }

  let released = false
  return async () => {
    if (released) return
    released = true
    await Promise.all([
      redis.del(leaseKey),
      redis.srem(activeKey, leaseId),
    ])
  }
}

export { RateLimitExceeded }
