import { Redis } from "@upstash/redis"
import { getRedisConfig, isDevelopment } from "./env"

// Enhanced Redis service with proper error handling, retry logic, and native Streams support
class RedisService {
  private redis: Redis | null = null
  private mockStore = new Map<string, string>()
  private mockStreams = new Map<string, Array<{ id: string; fields: Record<string, string> }>>()
  private isConnected = false
  private maxRetries = 2
  private retryDelay = 500

  constructor() {
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

    // If all retries failed and we have real Redis, fall back to mock
    if (this.isConnected) {
      console.error("[Saathi] Redis connection failed, falling back to mock storage")
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
    this.mockStore.set(key, serializedValue)
    if (options?.ex) {
      // Simple expiry simulation for mock
      setTimeout(() => this.mockStore.delete(key), options.ex * 1000)
    }
    return "OK"
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
    const existingSet = this.mockStore.get(key)
    if (!existingSet) return 0

    const currentMembers = JSON.parse(existingSet)
    const removedCount = members.filter(m => currentMembers.includes(m)).length
    const updatedSet = currentMembers.filter((m: string) => !members.includes(m))
    this.mockStore.set(key, JSON.stringify(updatedSet))
    return removedCount
  }

  // ─── Native Redis Streams ──────────────────────────────────────────────────

  /**
   * XADD — Append an entry to a Redis Stream.
   * Uses native Upstash `xadd` when connected; falls back to in-memory mock.
   */
  async xadd(
    streamKey: string,
    id: string,
    fields: Record<string, string>
  ): Promise<string> {
    if (this.isConnected && this.redis) {
      try {
        return await this.withRetry(async () => {
          const result = await this.redis!.xadd(streamKey, id, fields)
          return result as string
        })
      } catch (error) {
        console.error(`[Saathi] Redis XADD failed for stream ${streamKey}:`, error)
      }
    }

    // Mock fallback — simulate auto-generated ID
    const mockId = id === "*" ? `${Date.now()}-0` : id
    const stream = this.mockStreams.get(streamKey) || []
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
        return await this.withRetry(async () => {
          // Upstash SDK signature: xread(key, id, options?)
          const result = await this.redis!.xread(streamKey, fromId, { count }) as any

          if (!result || result.length === 0) return []

          // Response format: [[streamName, [[id, {field: value, ...}], ...]]]
          const streamData = result[0]
          if (!streamData || !streamData[1]) return []

          const entries = streamData[1]
          return entries.map((entry: any) => {
            const entryId = entry[0]
            const fieldsObj = entry[1]

            // Upstash may return fields as an object or as a flat array
            let fields: Record<string, string> = {}
            if (Array.isArray(fieldsObj)) {
              for (let i = 0; i < fieldsObj.length; i += 2) {
                fields[fieldsObj[i]] = fieldsObj[i + 1]
              }
            } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
              fields = fieldsObj
            }

            return { id: entryId, fields }
          })
        })
      } catch (error) {
        console.error(`[Saathi] Redis XREAD failed for stream ${streamKey}:`, error)
      }
    }

    // Mock fallback
    const stream = this.mockStreams.get(streamKey) || []
    if (fromId === "$") return [] // "$" = only new (nothing yet in mock without blocking)
    const startIdx = fromId === "0" || fromId === "0-0"
      ? 0
      : stream.findIndex(e => e.id > fromId)
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
          if (!result || result.length === 0) return []

          return result.map((entry: any) => {
            const entryId = entry[0]
            const fieldsObj = entry[1]

            let fields: Record<string, string> = {}
            if (Array.isArray(fieldsObj)) {
              for (let i = 0; i < fieldsObj.length; i += 2) {
                fields[fieldsObj[i]] = fieldsObj[i + 1]
              }
            } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
              fields = fieldsObj
            }

            return { id: entryId, fields }
          })
        })
      } catch (error) {
        console.error(`[Saathi] Redis XRANGE failed for stream ${streamKey}:`, error)
      }
    }

    // Mock fallback
    const stream = this.mockStreams.get(streamKey) || []
    const filtered = stream.filter(e => {
      if (start !== "-" && e.id < start) return false
      if (end !== "+" && e.id > end) return false
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

  getStatus(): { connected: boolean; type: 'redis' | 'mock' } {
    return {
      connected: this.isConnected,
      type: this.isConnected ? 'redis' : 'mock'
    }
  }
}

// Create singleton instance
const redisService = new RedisService()

export { redisService as redis }
export default redisService
