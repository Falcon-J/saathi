import crypto from "crypto"
import { redis } from "./redis.ts"

export class RateLimitExceeded extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super("Rate limit exceeded. Please try again later.")
    this.name = "RateLimitExceeded"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function hashScope(scope: string): string {
  return crypto.createHash("sha256").update(scope).digest("hex").slice(0, 16)
}

export async function consumeDistributedRateLimit(
  scope: string,
  maxRequests: number,
  windowMs: number,
): Promise<void> {
  if (!scope || !Number.isInteger(maxRequests) || maxRequests < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
    throw new Error("Rate-limit configuration is invalid")
  }

  const bucket = Math.floor(Date.now() / windowMs)
  const key = `rate:${hashScope(scope)}:${bucket}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.set(key, count, { ex: Math.ceil(windowMs / 1000) + 1 })
  }

  if (count > maxRequests) {
    const elapsedMs = Date.now() % windowMs
    throw new RateLimitExceeded(Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000)))
  }
}
