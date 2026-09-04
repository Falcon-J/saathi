import { Redis } from "@upstash/redis"
import { env, getRedisConfig, isDevelopment } from "./env.ts"
import { shouldUseMockRedis } from "./redis-policy.ts"

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
        return await operation()
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
    if (this.isConnected && this.redis) {
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

  async set(key: string, value: any, options?: { ex?: number }): Promise<string> {
    const serializedValue = this.serializeValue(value)

    if (this.isConnected && this.redis) {
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

    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
      try {
        return await this.withRetry(async () => {
          const result = await this.redis!.xrange(streamKey, start, end, count) as any
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
        console.error(`[Saathi] Redis XRANGE failed for stream ${streamKey}:`, error)
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
    return count ? filtered.slice(0, count) : filtered
  }

  /**
   * XLEN — Get the number of entries in a stream.
   */
  async xlen(streamKey: string): Promise<number> {
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
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
    if (this.isConnected && this.redis) {
      try {
        await this.redis.ping()
        return true
      } catch (error) {
        console.error("[Saathi] Redis ping failed:", error)
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
