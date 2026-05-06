// Redis Streams service — delegates to native XADD / XREAD / XRANGE / XTRIM
// exposed by RedisService (which uses the Upstash REST SDK directly).

import { redis } from "./redis"

export interface StreamEntry {
  id: string
  fields: Record<string, string>
}

export class StreamService {
  private static instance: StreamService

  static getInstance(): StreamService {
    if (!StreamService.instance) {
      StreamService.instance = new StreamService()
    }
    return StreamService.instance
  }

  /**
   * Append an entry to a Redis Stream.
   * Uses native XADD under the hood.
   */
  async xadd(streamKey: string, data: Record<string, any>): Promise<string> {
    // Flatten all values to strings (Redis Stream field-values must be strings)
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      fields[k] = typeof v === "string" ? v : JSON.stringify(v)
    }

    // Add a publishedAt timestamp for latency measurement
    fields._publishedAt = Date.now().toString()

    const entryId = await redis.xadd(streamKey, "*", fields)
    return entryId
  }

  /**
   * Read entries from a stream after the given ID.
   * Pass "0" or "0-0" to read from the beginning; "$" for only new entries.
   */
  async xread(streamKey: string, fromId: string = "0", count: number = 50): Promise<StreamEntry[]> {
    return redis.xread(streamKey, fromId, count)
  }

  /**
   * Read entries between two IDs (inclusive range).
   */
  async xrange(streamKey: string, start: string = "-", end: string = "+", count?: number): Promise<StreamEntry[]> {
    return redis.xrange(streamKey, start, end, count)
  }

  /**
   * Get the latest entry in a stream (most recent event).
   */
  async getLatestEntry(streamKey: string): Promise<StreamEntry | null> {
    // XRANGE with COUNT 1 in reverse order isn't available via Upstash REST,
    // so we use XRANGE to get the last few entries and return the last one.
    const entries = await redis.xrange(streamKey, "-", "+")
    return entries.length > 0 ? entries[entries.length - 1] : null
  }

  /**
   * Trim stream to a maximum length.
   */
  async xtrim(streamKey: string, maxlen: number): Promise<number> {
    return redis.xtrim(streamKey, maxlen)
  }

  /**
   * Get the number of entries in the stream.
   */
  async xlen(streamKey: string): Promise<number> {
    return redis.xlen(streamKey)
  }
}

export const streamService = StreamService.getInstance()
