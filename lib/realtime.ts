import { redis } from "./redis.ts"
import { streamService } from "./redis-streams.ts"
import { z } from "zod"

export type RealtimeEventType =
    | 'task-created'
    | 'task-updated'
    | 'task-deleted'
    | 'task-toggled'
    | 'user-joined'
    | 'user-left'
    | 'workspace-created'
    | 'member-added'
    | 'member-removed'

export interface RealtimeEvent {
    type: RealtimeEventType
    workspaceId: string
    userId: string
    timestamp: number
    data: Record<string, unknown>
}

export interface RealtimeStreamEvent extends RealtimeEvent {
    id: string
    publishedAt?: number
}

const realtimeEventSchema = z.object({
    type: z.enum([
        'task-created',
        'task-updated',
        'task-deleted',
        'task-toggled',
        'user-joined',
        'user-left',
        'workspace-created',
        'member-added',
        'member-removed',
    ]),
    workspaceId: z.string().trim().min(1).max(200),
    userId: z.string().trim().min(1).max(255),
    timestamp: z.number().int().nonnegative(),
    data: z.record(z.unknown()),
}).strict()

export function normalizeRealtimeEvent(input: unknown): RealtimeEvent {
    const result = realtimeEventSchema.safeParse(input)
    if (!result.success) {
        throw new Error("Realtime event is invalid")
    }

    return result.data
}

export function parseRealtimeStreamEntry(entry: { id: string; fields: Record<string, string> }): RealtimeStreamEvent | null {
    try {
        const { fields } = entry
        let parsed: unknown

        if (fields.type && fields.workspaceId) {
            parsed = {
                type: fields.type,
                workspaceId: fields.workspaceId,
                userId: fields.userId,
                timestamp: Number(fields.timestamp),
                data: fields.data ? JSON.parse(fields.data) : {},
            }
        } else if (fields.value) {
            parsed = JSON.parse(fields.value)
        } else {
            return null
        }

        const event = normalizeRealtimeEvent(parsed)
        const publishedAt = fields._publishedAt ? Number(fields._publishedAt) : undefined
        return {
            id: entry.id,
            ...event,
            ...(publishedAt !== undefined && Number.isFinite(publishedAt) ? { publishedAt } : {}),
        }
    } catch {
        return null
    }
}

// Redis Streams + Polling implementation for real-time events
export class RealtimeService {
    private static instance: RealtimeService
    private streamKey = 'saathi:events'
    private eventStreamPrefix = 'stream:'

    // ── Metrics ──
    private publishCount = 0
    private totalPublishLatency = 0

    static getInstance(): RealtimeService {
        if (!RealtimeService.instance) {
            RealtimeService.instance = new RealtimeService()
        }
        return RealtimeService.instance
    }

    /**
     * Publish event to workspace-scoped Redis Stream using native XADD.
     * Each event is stored as field-value pairs (not a JSON blob), enabling
     * native Stream consumers and lower per-event overhead.
     */
    async publishEvent(event: RealtimeEvent): Promise<string> {
        const normalizedEvent = normalizeRealtimeEvent(event)
        const publishStart = Date.now()
        try {
            const streamKey = `${this.eventStreamPrefix}${normalizedEvent.workspaceId}`

            // Build flat field-value map for XADD
            const fields: Record<string, string> = {
                type: normalizedEvent.type,
                workspaceId: normalizedEvent.workspaceId,
                userId: normalizedEvent.userId,
                timestamp: normalizedEvent.timestamp.toString(),
                data: JSON.stringify(normalizedEvent.data),
            }

            // Write to workspace stream with automatic trimming (keep last 1000)
            const streamId = await streamService.xadd(streamKey, fields)

            // Track metrics
            this.publishCount++
            this.totalPublishLatency += Date.now() - publishStart

            console.log(
                `[Realtime] Published ${normalizedEvent.type} → stream:${normalizedEvent.workspaceId} (${Date.now() - publishStart}ms)`
            )

            return streamId
        } catch (error) {
            console.error('[Realtime] Failed to publish event:', error instanceof Error ? error.message : 'unknown error')
            throw new Error("Realtime event publication failed")
        }
    }

    /**
     * Get recent events for a workspace using XRANGE.
     * Returns properly typed RealtimeEvent objects.
     */
    async getRecentEvents(workspaceId: string, limit: number = 20): Promise<RealtimeEvent[]> {
        try {
            const streamKey = `${this.eventStreamPrefix}${workspaceId}`
            const entries = await streamService.xrange(streamKey, "-", "+", limit)

            return entries.map(entry => this.entryToEvent(entry)).filter(Boolean) as RealtimeEvent[]
        } catch (error) {
            console.error('[Realtime] Failed to get recent events:', error)
            return []
        }
    }

    /**
     * Get latest event for polling.
     */
    async getLatestEvent(workspaceId: string): Promise<RealtimeEvent | null> {
        try {
            const streamKey = `${this.eventStreamPrefix}${workspaceId}`
            const latestEntry = await streamService.getLatestEntry(streamKey)

            if (!latestEntry) return null
            return this.entryToEvent(latestEntry)
        } catch (error) {
            console.error('[Realtime] Failed to get latest event:', error)
            return null
        }
    }

    async getLatestStreamId(workspaceId: string): Promise<string | null> {
        try {
            const streamKey = `${this.eventStreamPrefix}${workspaceId}`
            const latestEntry = await streamService.getLatestEntry(streamKey)
            return latestEntry?.id ?? null
        } catch (error) {
            console.error('[Realtime] Failed to get latest stream ID:', error)
            return null
        }
    }

    async getOldestStreamId(workspaceId: string): Promise<string | null> {
        try {
            const streamKey = `${this.eventStreamPrefix}${workspaceId}`
            const entries = await streamService.xrange(streamKey, "-", "+", 1)
            return entries[0]?.id ?? null
        } catch (error) {
            console.error('[Realtime] Failed to get oldest stream ID:', error)
            return null
        }
    }

    async getStreamBounds(workspaceId: string): Promise<{ oldestId: string; latestId: string } | null> {
        const streamKey = `${this.eventStreamPrefix}${workspaceId}`
        const entries = await streamService.xrange(streamKey, "-", "+")
        if (entries.length === 0) return null
        return { oldestId: entries[0].id, latestId: entries[entries.length - 1].id }
    }

    /**
     * Read new events after a given stream ID.
     * Used by the SSE route for efficient polling.
     */
    async readNewEvents(workspaceId: string, lastSeenId: string, count: number = 50) {
        const streamKey = `${this.eventStreamPrefix}${workspaceId}`
        const entries = await streamService.xread(streamKey, lastSeenId, count)
        return entries
            .map(entry => {
                const event = parseRealtimeStreamEntry(entry)
                return event
                    ? {
                        ...event,
                        _streamId: event.id,
                        _publishedAt: event.publishedAt,
                    }
                    : null
            })
            .filter((event): event is RealtimeStreamEvent & { _streamId: string; _publishedAt: number | undefined } => event !== null)
    }

    // ── User Presence ──────────────────────────────────────────────────────

    async setUserPresence(workspaceId: string, userId: string): Promise<void> {
        try {
            const presenceKey = `presence:${workspaceId}`
            const timestamp = Date.now()

            // Store user presence with timestamp and 5-minute TTL
            await redis.set(`${presenceKey}:${userId}`, timestamp.toString(), { ex: 300 })

            // Add to active users set
            await redis.sadd(`${presenceKey}:active`, userId)
        } catch (error) {
            console.error('[Realtime] Failed to set user presence:', error)
        }
    }

    async getActiveUsers(workspaceId: string): Promise<string[]> {
        try {
            const presenceKey = `presence:${workspaceId}`
            const activeUsers = await redis.smembers(`${presenceKey}:active`)

            // Filter out expired users
            const now = Date.now()
            const validUsers: string[] = []

            for (const userId of activeUsers) {
                const lastSeen = await redis.get(`${presenceKey}:${userId}`)
                if (lastSeen && (now - parseInt(lastSeen as string)) < 300000) { // 5 minutes
                    validUsers.push(userId)
                } else {
                    // Remove expired user
                    await redis.srem(`${presenceKey}:active`, userId)
                }
            }

            return validUsers
        } catch (error) {
            console.error('[Realtime] Failed to get active users:', error)
            return []
        }
    }

    // ── Stream Maintenance ─────────────────────────────────────────────────

    async trimStream(workspaceId: string, maxEntries: number = 1000): Promise<void> {
        try {
            const streamKey = `${this.eventStreamPrefix}${workspaceId}`
            const trimmed = await streamService.xtrim(streamKey, maxEntries)
            if (trimmed > 0) {
                console.log(`[Realtime] Trimmed ${trimmed} entries from workspace ${workspaceId}`)
            }
        } catch (error) {
            console.error('[Realtime] Failed to trim stream:', error)
        }
    }

    // ── Metrics ────────────────────────────────────────────────────────────

    getMetrics() {
        return {
            publishCount: this.publishCount,
            avgPublishLatencyMs: this.publishCount > 0
                ? Math.round(this.totalPublishLatency / this.publishCount)
                : 0,
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────

    /**
     * Convert a raw stream entry (field-value pairs) back to a RealtimeEvent.
     */
    private entryToEvent(entry: { id: string; fields: Record<string, string> }): RealtimeEvent | null {
        const parsed = parseRealtimeStreamEntry(entry)
        if (!parsed) return null

        const { id: _id, publishedAt: _publishedAt, ...event } = parsed
        return event
    }
}

export const realtimeService = RealtimeService.getInstance()
