import { Redis } from "@upstash/redis"
import { getRedisConfig, env, isDevelopment } from "./env"

// Enhanced Redis service with proper error handling and retry logic
class RedisService {
  private redis: Redis | null = null
  private mockStore = new Map<string, string>()
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
            backoff: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000)
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
            return await this.redis!.setex(key, options.ex, serializedValue)
          }
          return await this.redis!.set(key, serializedValue)
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
          return await this.redis!.sadd(key, ...members)
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
          return await this.redis!.srem(key, ...members)
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

  // Note: Redis Streams (XADD, XREAD) are not supported by Upstash REST API
  // We'll use simple key-value operations for real-time updates instead

  // Health check method
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

  // Get connection status
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
