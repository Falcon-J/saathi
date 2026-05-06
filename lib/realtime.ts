import { redis } from "./redis"
import { streamService } from "./redis-streams"

// Real-time event types
export interface RealtimeEvent {
    type: 'task-created' | 'task-updated' | 'task-deleted' | 'task-toggled' | 'user-joined' | 'user-left' | 'workspace-created' | 'member-added' | 'member-removed'
    workspaceId: string
    userId: string
    timestamp: number
    data: any
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
    async publishEvent(event: RealtimeEvent): Promise<void> {
        const publishStart = Date.now()
        try {
            const streamKey = `${this.eventStreamPrefix}${event.workspaceId}`

            // Build flat field-value map for XADD
            const fields: Record<string, string> = {
                type: event.type,
                workspaceId: event.workspaceId,
                userId: event.userId,
                timestamp: event.timestamp.toString(),
                data: JSON.stringify(event.data),
            }

            // Write to workspace stream with automatic trimming (keep last 1000)
            await streamService.xadd(streamKey, fields)

            // Track metrics
            this.publishCount++
            this.totalPublishLatency += Date.now() - publishStart

            console.log(
                `[Realtime] Published ${event.type} → stream:${event.workspaceId} (${Date.now() - publishStart}ms)`
            )
        } catch (error) {
            console.error('[Realtime] Failed to publish event:', error)
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

    /**
     * Read new events after a given stream ID.
     * Used by the SSE route for efficient polling.
     */
    async readNewEvents(workspaceId: string, lastSeenId: string, count: number = 50) {
        try {
            const streamKey = `${this.eventStreamPrefix}${workspaceId}`
            const entries = await streamService.xread(streamKey, lastSeenId, count)
            return entries.map(entry => ({
                ...this.entryToEvent(entry),
                _streamId: entry.id,
                _publishedAt: entry.fields._publishedAt ? parseInt(entry.fields._publishedAt) : undefined,
            }))
        } catch (error) {
            console.error('[Realtime] Failed to read new events:', error)
            return []
        }
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
        try {
            const { fields } = entry

            // New format: fields are flat key-value pairs from XADD
            if (fields.type && fields.workspaceId) {
                return {
                    type: fields.type as RealtimeEvent['type'],
                    workspaceId: fields.workspaceId,
                    userId: fields.userId || '',
                    timestamp: fields.timestamp ? parseInt(fields.timestamp) : Date.now(),
                    data: fields.data ? JSON.parse(fields.data) : {},
                }
            }

            // Legacy format: single "value" field with full JSON blob
            if (fields.value) {
                const parsed = JSON.parse(fields.value)
                return parsed as RealtimeEvent
            }

            return null
        } catch {
            return null
        }
    }
}

export const realtimeService = RealtimeService.getInstance()