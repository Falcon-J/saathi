import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"
import { realtimeService } from "@/lib/realtime"
import { authorizeWorkspaceMember } from "@/lib/workspace-policy"
import { loadStoredSession } from "@/lib/session-boundary"
import { schemas } from "@/lib/security"
import { createSingleFlightPoll, getInitialStreamCursor, getReplayStatus } from "@/lib/realtime-sse"
import { getRateLimits } from "@/lib/env"
import { acquireSseConnectionLease, RateLimitExceeded, SseConnectionLimitExceeded } from "@/lib/sse-connection"

export const dynamic = "force-dynamic"

// Required for withCredentials: true on EventSource
const SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(process.env.NEXT_PUBLIC_APP_URL ? {
        'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL,
        'Access-Control-Allow-Credentials': 'true',
    } : {}),
}

// Preflight handler for withCredentials CORS
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Headers': 'Cookie, Content-Type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            ...(process.env.NEXT_PUBLIC_APP_URL ? {
                'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL,
                'Access-Control-Allow-Credentials': 'true',
            } : {}),
        }
    })
}

/**
 * SSE endpoint for real-time workspace events.
 *
 * Architecture:
 *  - Uses native Redis Streams (XREAD) via RealtimeService
 *  - Polls every 100ms for cursor-based event delivery
 *  - Each client maintains its own cursor (lastSeenId) into the stream
 *  - Heartbeat every 30s to refresh user presence and report active users
 *  - Auto-cleanup after 30 minutes to prevent dangling connections
 */
export async function GET(request: NextRequest) {
    let releaseSseConnection: (() => Promise<void>) | undefined
    try {
        // Verify authentication directly (not via server action)
        const cookieStore = await cookies()
        const sessionId = cookieStore.get("auth-session")?.value

        if (!sessionId) {
            return new Response("Unauthorized", { status: 401 })
        }

        const session = await loadStoredSession(sessionId, (id) => redis.get(`session:${id}`))
        if (!session) {
            return new Response("Unauthorized", { status: 401 })
        }

        // Get workspace ID from query params
        const { searchParams } = new URL(request.url)
        const requestedWorkspaceId = searchParams.get('workspaceId')

        const workspaceIdResult = schemas.workspaceId.safeParse(requestedWorkspaceId)
        if (!workspaceIdResult.success) {
            return new Response("Workspace ID required", { status: 400 })
        }
        const workspaceId = workspaceIdResult.data

        const workspaceData = await redis.get(`workspace:${workspaceId}`)
        const authorization = authorizeWorkspaceMember(workspaceData, session.email)
        if (!authorization.allowed) {
            return new Response(authorization.message, { status: authorization.status })
        }

        try {
            const { sse } = getRateLimits()
            releaseSseConnection = await acquireSseConnectionLease({
                userId: session.email,
                maxConnections: sse.maxConnections,
                leaseSeconds: sse.leaseSeconds,
                maxAttempts: sse.maxRequests,
                attemptWindowMs: sse.windowMs,
            })
        } catch (error) {
            if (error instanceof RateLimitExceeded || error instanceof SseConnectionLimitExceeded) {
                return new Response(error.message, {
                    status: 429,
                    headers: { "Retry-After": String(error.retryAfterSeconds) },
                })
            }
            throw error
        }

        // Set user presence
        await realtimeService.setUserPresence(workspaceId, session.email)

        const streamBounds = await realtimeService.getStreamBounds(workspaceId)
        const latestStreamId = streamBounds?.latestId ?? null
        const oldestStreamId = streamBounds?.oldestId ?? null
        const encoder = new TextEncoder()
        const formatSSE = (data: any, eventId?: string) => (
            `${eventId ? `id: ${eventId}\n` : ""}data: ${JSON.stringify(data)}\n\n`
        )

        let cleanupStream: (() => void) | undefined
        const stream = new ReadableStream({
            async start(controller) {
                // Send initial connection message
                controller.enqueue(encoder.encode(formatSSE({
                    type: 'connected',
                    timestamp: Date.now(),
                    data: { userId: session.email, workspaceId },
                    transport: 'sse'
                })))

                // Tell the browser to reconnect quickly if disconnected
                controller.enqueue(encoder.encode("retry: 1000\n\n"))

                const lastEventId = request.headers.get("last-event-id")
                const replayStatus = getReplayStatus(lastEventId, oldestStreamId, latestStreamId)
                // Use Redis's own stream ID rather than the Vercel server clock.
                // Stream IDs are generated by Redis, so a local timestamp can be
                // ahead of the next event when the clocks are not identical.
                let lastSeenId = replayStatus === "resync-required"
                    ? getInitialStreamCursor(null, latestStreamId)
                    : getInitialStreamCursor(lastEventId, latestStreamId)
                let closed = false
                let streamErrorSent = false

                if (replayStatus === "resync-required") {
                    controller.enqueue(encoder.encode(formatSSE({
                        type: "resync-required",
                        timestamp: Date.now(),
                        data: {
                            workspaceId,
                            reason: "Requested events are no longer retained",
                        },
                    })))
                }

                // ── Heartbeat (30s) ─────────────────────────────────────
                const sendHeartbeat = async () => {
                    if (closed) return
                    try {
                        await realtimeService.setUserPresence(workspaceId, session.email)
                        const activeUsers = await realtimeService.getActiveUsers(workspaceId)
                        const metrics = realtimeService.getMetrics()

                        if (closed) return
                        controller.enqueue(encoder.encode(formatSSE({
                            type: 'heartbeat',
                            timestamp: Date.now(),
                            data: { activeUsers, workspaceId, metrics }
                        })))
                    } catch (error) {
                        console.error('[SSE] Heartbeat failed:', error)
                    }
                }

                // ── Event polling (100ms) ───────────────────────────────
                // End-to-end delivery latency is measured on each event and
                // depends on polling, storage, network, and runtime latency.
                const pollForEvents = createSingleFlightPoll(async () => {
                    if (closed) return
                    try {
                        const newEvents = await realtimeService.readNewEvents(
                            workspaceId,
                            lastSeenId,
                            50  // batch up to 50 events per poll
                        )

                        if (closed) return
                        streamErrorSent = false

                        if (newEvents.length > 0) {
                            const currentBounds = await realtimeService.getStreamBounds(workspaceId)
                            const currentReplayStatus = getReplayStatus(
                                lastSeenId,
                                currentBounds?.oldestId ?? null,
                                currentBounds?.latestId ?? null,
                            )
                            if (currentReplayStatus === "resync-required") {
                                controller.enqueue(encoder.encode(formatSSE({
                                    type: "resync-required",
                                    timestamp: Date.now(),
                                    data: {
                                        workspaceId,
                                        reason: "Requested events are no longer retained",
                                    },
                                })))
                                lastSeenId = currentBounds?.latestId ?? lastSeenId
                                return
                            }

                            for (const event of newEvents) {
                                if (event._streamId) {
                                    lastSeenId = event._streamId
                                }

                                // Calculate delivery latency
                                const deliveredAt = Date.now()
                                const publishedAt = event._publishedAt || event.timestamp
                                const latencyMs = publishedAt ? deliveredAt - publishedAt : null

                                controller.enqueue(encoder.encode(formatSSE({
                                    type: event.type,
                                    workspaceId: event.workspaceId,
                                    userId: event.userId,
                                    timestamp: event.timestamp,
                                    data: event.data,
                                    deliveredAt,
                                    latencyMs,
                                }, event._streamId)))
                            }
                        }
                    } catch (error) {
                        console.error('[SSE] Stream poll failed:', error)
                        if (!closed && !streamErrorSent) {
                            streamErrorSent = true
                            controller.enqueue(encoder.encode(formatSSE({
                                type: 'error',
                                timestamp: Date.now(),
                                data: { message: 'Realtime updates are temporarily unavailable.' },
                            })))
                        }
                    }
                })

                const pollInterval = setInterval(() => { void pollForEvents() }, 100)
                const heartbeatInterval = setInterval(sendHeartbeat, 30000)
                let cleanupTimer: ReturnType<typeof setTimeout> | undefined

                // ── Cleanup ─────────────────────────────────────────────
                const cleanup = () => {
                    if (closed) return
                    closed = true
                    clearInterval(pollInterval)
                    clearInterval(heartbeatInterval)
                    if (cleanupTimer) clearTimeout(cleanupTimer)
                    realtimeService.setUserPresence(workspaceId, session.email).catch(err =>
                        console.error('[SSE] Error updating presence on disconnect:', err)
                    )
                    void releaseSseConnection?.().catch(err =>
                        console.error('[SSE] Error releasing connection lease:', err)
                    )
                    try {
                        controller.close()
                    } catch {
                        // The stream may already be closed by the runtime.
                    }
                }

                cleanupStream = cleanup
                request.signal.addEventListener('abort', cleanup)
                if (request.signal.aborted) cleanup()

                // Auto-cleanup after 30 minutes
                cleanupTimer = setTimeout(cleanup, 30 * 60 * 1000)
                void sendHeartbeat()
            },
            cancel() {
                cleanupStream?.()
            }
        })

        return new Response(stream, { headers: SSE_HEADERS })
    } catch (error) {
        void releaseSseConnection?.().catch(err =>
            console.error('[SSE] Error releasing connection lease after setup failure:', err)
        )
        console.error('[SSE] Error setting up stream:', error)
        return new Response("Internal Server Error", { status: 500 })
    }
}
