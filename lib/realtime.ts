import { redis } from "./redis"

// Real-time event types
export interface RealtimeEvent {
    type: 'task-created' | 'task-updated' | 'task-deleted' | 'task-toggled' | 'user-joined' | 'user-left'
    workspaceId: string
    userId: string
    timestamp: number
    data: any
}

// Redis Streams implementation for real-time events
export class RealtimeService {
    private static instance: RealtimeService
    private streamKey = 'saathi:events'

    static getInstance(): RealtimeService {
        if (!RealtimeService.instance) {
            RealtimeService.instance = new RealtimeService()
        }
        return RealtimeService.instance
    }

    // Publish event to Redis Stream (optimized for speed)
    async publishEvent(event: RealtimeEvent): Promise<void> {
        try {
            const eventData = {
                ...event,
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            }

            const channelKey = `events:${event.workspaceId}`

            // Only store the latest event for real-time updates (skip history for performance)
            await redis.set(`${channelKey}:latest`, JSON.stringify(eventData))

            console.log(`[Realtime] Published event: ${event.type} for workspace ${event.workspaceId}`)
        } catch (error) {
            console.error('[Realtime] Failed to publish event:', error)
        }
    }

    // Get recent events for a workspace
    async getRecentEvents(workspaceId: string, limit: number = 20): Promise<RealtimeEvent[]> {
        try {
            const eventsListKey = `events:${workspaceId}:history`
            const eventsData = await redis.get(eventsListKey)

            if (!eventsData) return []

            // Handle both string and object responses from Redis
            let events: RealtimeEvent[]
            if (typeof eventsData === 'string') {
                events = JSON.parse(eventsData)
            } else if (Array.isArray(eventsData)) {
                events = eventsData
            } else {
                return []
            }

            return events.slice(0, limit)
        } catch (error) {
            console.error('[Realtime] Failed to get recent events:', error)
            return []
        }
    }

    // Get latest event for polling
    async getLatestEvent(workspaceId: string): Promise<RealtimeEvent | null> {
        try {
            const channelKey = `events:${workspaceId}`
            const eventData = await redis.get(`${channelKey}:latest`)

            if (!eventData) return null

            // Handle both string and object responses from Redis
            if (typeof eventData === 'string') {
                return JSON.parse(eventData)
            } else if (typeof eventData === 'object') {
                return eventData as RealtimeEvent
            }

            return null
        } catch (error) {
            console.error('[Realtime] Failed to get latest event:', error)
            return null
        }
    }

    // Track user presence
    async setUserPresence(workspaceId: string, userId: string): Promise<void> {
        try {
            const presenceKey = `presence:${workspaceId}`
            const timestamp = Date.now()

            // Store user presence with timestamp
            await redis.set(`${presenceKey}:${userId}`, timestamp.toString(), { ex: 300 }) // 5 minutes TTL

            // Add to active users set
            await redis.sadd(`${presenceKey}:active`, userId)
        } catch (error) {
            console.error('[Realtime] Failed to set user presence:', error)
        }
    }

    // Get active users
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
}

export const realtimeService = RealtimeService.getInstance()