import { Redis } from "@upstash/redis"
import { env, getRedisConfig, isDevelopment } from "./env.ts"
import { shouldUseMockRedis } from "./redis-policy.ts"

const streamBoundsScript = `
local oldest = redis.call('XRANGE', KEYS[1], '-', '+', 'COUNT', 1)
if #oldest == 0 then return {} end
local latest = redis.call('XREVRANGE', KEYS[1], '+', '-', 'COUNT', 1)
return {oldest[1][1], latest[1][1]}
`

const claimSseLeaseScript = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then return 1 end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]) * 1000, ARGV[1])
local latest = redis.call('ZRANGE', KEYS[1], -1, -1, 'WITHSCORES')
redis.call('PEXPIRE', KEYS[1], math.max(1, math.ceil(tonumber(latest[2]) - now)))
return 1
`

function compareStreamIds(left: string, right: string): number {
  const [leftMilliseconds, leftSequence] = left.split("-").map(Number)
  const [rightMilliseconds, rightSequence] = right.split("-").map(Number)

  if (leftMilliseconds !== rightMilliseconds) return leftMilliseconds - rightMilliseconds
  return leftSequence - rightSequence
}

type MockRedisState = {
  store: Map<string, string>
  streams: Map<string, Array<{ id: string; fields: Record<string, string> }>>
}

const mockRedisGlobal = globalThis as typeof globalThis & {
  __saathiMockRedis?: MockRedisState
}

const sharedMockRedis: MockRedisState = mockRedisGlobal.__saathiMockRedis ??= {
  store: new Map(),
  streams: new Map(),
}

// Enhanced Redis service with proper error handling, retry logic, and native Streams support
class RedisService {
  private redis: Redis | null = null
  private mockStore = sharedMockRedis.store
  private mockStreams = sharedMockRedis.streams
  private isConnected = false
  private mockStorageEnabled = false
  private maxRetries = 2
  private retryDelay = 500

  constructor() {
    const { url, token } = getRedisConfig()
    this.mockStorageEnabled = shouldUseMockRedis(env.NODE_ENV, Boolean(url && token))
    this.initialize()
  }

  private initialize() {
    const { url, token } = getRedisConfig()

    if (url && token) {
      try {
        this.redis = new Redis({
          url,
          token,
          retry: {
            retries: this.maxRetries,
            backoff: (retryCount: number) => Math.min(1000 * Math.pow(2, retryCount), 10000)
          }
        })
        this.isConnected = true
        console.log("[Saathi] Connected to Upstash Redis for real-time collaboration")
      } catch (error) {
        console.error("[Saathi] Failed to connect to Redis:", error)
        this.fallbackToMock()
      }
    } else {
      this.fallbackToMock()
    }
  }

  private fallbackToMock() {
    if (!this.mockStorageEnabled) {
      console.error("[Saathi] Redis unavailable; mock storage is disabled")
      return
    }

    if (isDevelopment) {
      console.warn("[Saathi] Using enhanced mock Redis client for development")
      console.warn("[Saathi] For production, add these environment variables:")
      console.warn("[Saathi]   - UPSTASH_REDIS_REST_URL")
      console.warn("[Saathi]   - UPSTASH_REDIS_REST_TOKEN")
    } else {
      console.error("[Saathi] Redis configuration missing in production!")
    }
    this.isConnected = false
  }

  private assertMockStorageEnabled() {
    if (!this.mockStorageEnabled) {
      throw new Error("Redis unavailable")
    }
  }

  private nextMockStreamId(stream: Array<{ id: string; fields: Record<string, string> }>): string {
    const now = Date.now()
    const previousId = stream.at(-1)?.id
    if (!previousId) return `${now}-0`

    const [previousMilliseconds, previousSequence] = previousId.split("-").map(Number)
    return now > previousMilliseconds
      ? `${now}-0`
      : `${previousMilliseconds}-${previousSequence + 1}`
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation()
        this.isConnected = true
        return result
      } catch (error) {
        lastError = error as Error
        console.warn(`[Saathi] Redis operation failed (attempt ${attempt}/${this.maxRetries}):`, error)

        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay))
        }
      }
    }

    // Mark the adapter unavailable after all retries. Callers decide how to surface the failure.
    if (this.isConnected) {
      console.error("[Saathi] Redis connection failed; mock storage will remain disabled")
      this.isConnected = false
    }

    throw lastError || new Error("Redis operation failed after retries")
  }

  private serializeValue(value: any): string {
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  private deserializeValue(value: string | null): any {
    if (!value) return null
    try {
      return JSON.parse(value)
    } catch {
      return value // Return as string if not valid JSON
    }
  }

  async get(key: string): Promise<any> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          const result = await this.redis!.get(key)
          return this.deserializeValue(result as string)
        })
      } catch (error) {
        console.error(`[Saathi] Redis GET failed for key ${key}:`, error)
      }
    }

    // Fallback to mock
    this.assertMockStorageEnabled()
    const value = this.mockStore.get(key)
    return this.deserializeValue(value || null)
  }

  async mget(...keys: string[]): Promise<any[]> {
    if (keys.length === 0) return []
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          const values = await this.redis!.mget(...keys)
          return values.map(value => this.deserializeValue(value as string | null))
        })
      } catch {
        console.error("[Saathi] Redis MGET failed")
      }
    }
    this.assertMockStorageEnabled()
    return keys.map(key => this.deserializeValue(this.mockStore.get(key) || null))
  }

  async set(key: string, value: any, options?: { ex?: number }): Promise<string> {
    const serializedValue = this.serializeValue(value)

    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          if (options?.ex) {
            return (await this.redis!.setex(key, options.ex, serializedValue)) ?? "OK"
          }
          return (await this.redis!.set(key, serializedValue)) ?? "OK"
        })
      } catch (error) {
        console.error(`[Saathi] Redis SET failed for key ${key}:`, error)
      }
    }

    // Fallback to mock
    this.assertMockStorageEnabled()
    this.mockStore.set(key, serializedValue)
    if (options?.ex) {
      // Simple expiry simulation for mock
      const expiryTimer = setTimeout(() => this.mockStore.delete(key), options.ex * 1000)
      expiryTimer.unref?.()
    }
    return "OK"
  }

  async setIfAbsent(key: string, value: any, options?: { ex?: number }): Promise<boolean> {
    const serializedValue = this.serializeValue(value)

    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          const result = await this.redis!.set(key, serializedValue, {
            nx: true,
            ...(options?.ex ? { ex: options.ex } : {}),
          } as any)
          return result === "OK"
        })
      } catch (error) {
        console.error(`[Saathi] Redis SET NX failed for key ${key}:`, error)
      }
    }

    this.assertMockStorageEnabled()
    if (this.mockStore.has(key)) return false

    this.mockStore.set(key, serializedValue)
    if (options?.ex) {
      const expiryTimer = setTimeout(() => this.mockStore.delete(key), options.ex * 1000)
      expiryTimer.unref?.()
    }
    return true
  }

  async del(key: string): Promise<number> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          return await this.redis!.del(key)
        })
      } catch (error) {
        console.error(`[Saathi] Redis DEL failed for key ${key}:`, error)
      }
    }

    // Fallback to mock
    this.assertMockStorageEnabled()
    const existed = this.mockStore.has(key)
    this.mockStore.delete(key)
    return existed ? 1 : 0
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          return await (this.redis as any).sadd(key, ...members)
        })
      } catch (error) {
        console.error(`[Saathi] Redis SADD failed for key ${key}:`, error)
      }
    }

    // Fallback to mock
    this.assertMockStorageEnabled()
    const existingSet = this.mockStore.get(key)
    const currentMembers = existingSet ? JSON.parse(existingSet) : []
    const newMembers = members.filter(m => !currentMembers.includes(m))
    const updatedSet = [...currentMembers, ...newMembers]
    this.mockStore.set(key, JSON.stringify(updatedSet))
    return newMembers.length
  }

  async smembers(key: string): Promise<string[]> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          return await this.redis!.smembers(key)
        })
      } catch (error) {
        console.error(`[Saathi] Redis SMEMBERS failed for key ${key}:`, error)
      }
    }

    // Fallback to mock
    this.assertMockStorageEnabled()
    const set = this.mockStore.get(key)
    return set ? JSON.parse(set) : []
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          return await (this.redis as any).srem(key, ...members)
        })
      } catch (error) {
        console.error(`[Saathi] Redis SREM failed for key ${key}:`, error)
      }
    }

    // Fallback to mock
    this.assertMockStorageEnabled()
    const existingSet = this.mockStore.get(key)
    if (!existingSet) return 0

    const currentMembers = JSON.parse(existingSet)
    const removedCount = members.filter(m => currentMembers.includes(m)).length
    const updatedSet = currentMembers.filter((m: string) => !members.includes(m))
    this.mockStore.set(key, JSON.stringify(updatedSet))
    return removedCount
  }

  async incr(key: string): Promise<number> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => this.redis!.incr(key))
      } catch (error) {
        console.error(`[Saathi] Redis INCR failed for key ${key}:`, error)
      }
    }

    this.assertMockStorageEnabled()
    const nextValue = Number(this.mockStore.get(key) || "0") + 1
    this.mockStore.set(key, String(nextValue))
    return nextValue
  }

  /** Atomic admission, with Redis's clock and one declared key. Retries reuse the lease ID. */
  async claimSseLease(key: string, leaseId: string, maxConnections: number, leaseSeconds: number): Promise<boolean> {
    if (!key || !leaseId || !Number.isInteger(maxConnections) || maxConnections < 1 || !Number.isInteger(leaseSeconds) || leaseSeconds < 1) {
      throw new Error("SSE lease configuration is invalid")
    }
    if (this.redis) {
      return this.withRetry(async () => Number(await this.redis!.eval(claimSseLeaseScript, [key], [leaseId, maxConnections, leaseSeconds])) === 1)
    }
    this.assertMockStorageEnabled()
    const now = Date.now()
    const leases: Array<[string, number]> = JSON.parse(this.mockStore.get(key) ?? "[]")
    const live = leases.filter(([, expiry]) => expiry > now)
    if (live.some(([id]) => id === leaseId)) return true
    if (live.length >= maxConnections) return false
    this.mockStore.set(key, JSON.stringify([...live, [leaseId, now + leaseSeconds * 1000]]))
    return true
  }

  async releaseSseLease(key: string, leaseId: string): Promise<void> {
    if (this.redis) {
      await this.withRetry(async () => this.redis!.zrem(key, leaseId))
      return
    }
    this.assertMockStorageEnabled()
    const leases: Array<[string, number]> = JSON.parse(this.mockStore.get(key) ?? "[]")
    const remaining = leases.filter(([id]) => id !== leaseId)
    if (remaining.length) this.mockStore.set(key, JSON.stringify(remaining))
    else this.mockStore.delete(key)
  }

  // ─── Native Redis Streams ──────────────────────────────────────────────────

  /**
   * XADD — Append an entry to a Redis Stream.
   * Uses native Upstash `xadd` when connected; falls back to in-memory mock.
   */
  async xadd(
    streamKey: string,
    id: string,
    fields: Record<string, string>,
    maxEntries?: number,
  ): Promise<string> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          const result = await this.redis!.xadd(streamKey, id, fields, maxEntries ? {
            trim: { type: "MAXLEN", comparison: "~", threshold: maxEntries },
          } : undefined)
          return result as string
        })
      } catch (error) {
        console.error(`[Saathi] Redis XADD failed for stream ${streamKey}:`, error)
      }
    }

    // Mock fallback — simulate auto-generated ID
    this.assertMockStorageEnabled()
    const stream = this.mockStreams.get(streamKey) || []
    const mockId = id === "*" ? this.nextMockStreamId(stream) : id
    stream.push({ id: mockId, fields })
    // Keep bounded
    if (stream.length > 1000) stream.splice(0, stream.length - 1000)
    this.mockStreams.set(streamKey, stream)
    return mockId
  }

  /**
   * XREAD — Read entries from one or more streams after the given ID.
   * Returns entries newer than `fromId`.  Pass "$" for only new entries.
   */
  async xread(
    streamKey: string,
    fromId: string,
    count: number = 50
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    if (this.redis) {
      try {
        // Upstash REST deployments can reject repeated non-blocking XREAD
        // polls. XRANGE is supported by the same Redis Streams API and keeps
        // the cursor semantics explicit for our short polling interval.
        if (fromId === "$") return []
        const entries = await this.xrange(streamKey, fromId, "+", count + 1)
        return entries.filter(entry => compareStreamIds(entry.id, fromId) > 0).slice(0, count)
      } catch (error) {
        console.error(`[Saathi] Redis stream poll failed for stream ${streamKey}:`, error)
      }
    }

    // Mock fallback
    this.assertMockStorageEnabled()
    const stream = this.mockStreams.get(streamKey) || []
    if (fromId === "$") return [] // "$" = only new (nothing yet in mock without blocking)
    const startIdx = fromId === "0" || fromId === "0-0"
      ? 0
      : stream.findIndex(e => compareStreamIds(e.id, fromId) > 0)
    if (startIdx === -1) return []
    return stream.slice(startIdx, startIdx + count)
  }

  /**
   * XRANGE — Read entries in a stream between two IDs.
   */
  async xrange(
    streamKey: string,
    start: string = "-",
    end: string = "+",
    count?: number
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    return this.readStreamRange(streamKey, start, end, count)
  }

  async getLatestStreamEntry(streamKey: string): Promise<{ id: string; fields: Record<string, string> } | null> {
    return (await this.readStreamRange(streamKey, "-", "+", 1, true))[0] ?? null
  }

  async getStreamBounds(streamKey: string): Promise<{ oldestId: string; latestId: string } | null> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          const ids = await this.redis!.eval<string[]>(streamBoundsScript, [streamKey], [])
          if (Array.isArray(ids) && ids.length === 0) return null
          if (!Array.isArray(ids) || ids.length !== 2 || ids.some(id => typeof id !== "string")) throw new Error("Invalid stream bounds")
          return { oldestId: ids[0], latestId: ids[1] }
        })
      } catch (error) {
        console.error(`[Saathi] Redis stream bounds failed for stream ${streamKey}:`, error)
      }
    }
    this.assertMockStorageEnabled()
    const stream = this.mockStreams.get(streamKey) || []
    return stream.length ? { oldestId: stream[0].id, latestId: stream[stream.length - 1].id } : null
  }

  private async readStreamRange(
    streamKey: string,
    start: string,
    end: string,
    count?: number,
    reverse = false
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          const result = (reverse
            ? await this.redis!.xrevrange(streamKey, end, start, count)
            : await this.redis!.xrange(streamKey, start, end, count)) as any
          if (!result || (Array.isArray(result) && result.length === 0)) return []

          const rawEntries = Array.isArray(result)
            ? result
            : Object.entries(result).map(([entryId, fields]) => [entryId, fields])

          return rawEntries.map((entry: any) => {
            const entryId = entry[0] as string
            const fieldsObj = entry[1] as Record<string, unknown> | unknown[]

            let fields: Record<string, string> = {}
            if (Array.isArray(fieldsObj)) {
              for (let i = 0; i < fieldsObj.length; i += 2) {
                const field = fieldsObj[i]
                const value = fieldsObj[i + 1]
                if (typeof field === "string") {
                  fields[field] = typeof value === "string" ? value : JSON.stringify(value)
                }
              }
            } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
              for (const [field, value] of Object.entries(fieldsObj)) {
                fields[field] = typeof value === "string" ? value : JSON.stringify(value)
              }
            }

            return { id: entryId, fields }
          })
        })
      } catch (error) {
        console.error(`[Saathi] Redis ${reverse ? "XREVRANGE" : "XRANGE"} failed for stream ${streamKey}:`, error)
      }
    }

    // Mock fallback
    this.assertMockStorageEnabled()
    const stream = this.mockStreams.get(streamKey) || []
    const filtered = stream.filter(e => {
      if (start !== "-" && compareStreamIds(e.id, start) < 0) return false
      if (end !== "+" && compareStreamIds(e.id, end) > 0) return false
      return true
    })
    if (reverse) filtered.reverse()
    return count ? filtered.slice(0, count) : filtered
  }

  /**
   * XLEN — Get the number of entries in a stream.
   */
  async xlen(streamKey: string): Promise<number> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          return await this.redis!.xlen(streamKey)
        })
      } catch (error) {
        console.error(`[Saathi] Redis XLEN failed for stream ${streamKey}:`, error)
      }
    }

    // Mock fallback
    this.assertMockStorageEnabled()
    return (this.mockStreams.get(streamKey) || []).length
  }

  /**
   * XTRIM — Trim a stream to a maximum length.
   */
  async xtrim(streamKey: string, maxlen: number): Promise<number> {
    if (this.redis) {
      try {
        return await this.withRetry(async () => {
          return await this.redis!.xtrim(streamKey, { strategy: "MAXLEN", threshold: maxlen })
        })
      } catch (error) {
        console.error(`[Saathi] Redis XTRIM failed for stream ${streamKey}:`, error)
      }
    }

    // Mock fallback
    this.assertMockStorageEnabled()
    const stream = this.mockStreams.get(streamKey) || []
    const removed = Math.max(0, stream.length - maxlen)
    if (removed > 0) {
      this.mockStreams.set(streamKey, stream.slice(-maxlen))
    }
    return removed
  }

  // ─── Health & Status ───────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    if (this.redis) {
      try {
        await this.redis.ping()
        this.isConnected = true
        return true
      } catch {
        console.error("[Saathi] Redis ping failed")
        this.isConnected = false
        return false
      }
    }
    return false
  }

  getStatus(): { connected: boolean; type: 'redis' | 'mock' | 'unavailable' } {
    return {
      connected: this.isConnected,
      type: this.isConnected ? 'redis' : this.mockStorageEnabled ? 'mock' : 'unavailable'
    }
  }
}

// Create singleton instance
const redisService = new RedisService()

export { redisService as redis }
export default redisService
