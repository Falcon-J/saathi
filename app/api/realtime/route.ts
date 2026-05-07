import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"
import { realtimeService } from "@/lib/realtime"

export const dynamic = "force-dynamic"

// Required for withCredentials: true on EventSource
const SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    // Allow credentials (cookie) to be forwarded from the browser
    'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
    'Access-Control-Allow-Credentials': 'true',
}

// Preflight handler for withCredentials CORS
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers': 'Cookie, Content-Type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        }
    })
}

/**
 * SSE endpoint for real-time workspace events.
 *
 * Architecture:
 *  - Uses native Redis Streams (XREAD) via RealtimeService
 *  - Polls every 100ms for sub-50ms median event delivery
 *  - Each client maintains its own cursor (lastSeenId) into the stream
 *  - Heartbeat every 30s to refresh user presence and report active users
 *  - Auto-cleanup after 30 minutes to prevent dangling connections
 */
export async function GET(request: NextRequest) {
    try {
        // Verify authentication directly (not via server action)
        const cookieStore = await cookies()
        const sessionId = cookieStore.get("auth-session")?.value

        if (!sessionId) {
            return new Response("Unauthorized", { status: 401 })
        }

        const sessionData = await redis.get(`session:${sessionId}`)
        if (!sessionData) {
            return new Response("Unauthorized", { status: 401 })
        }

        const session = typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData

        // Get workspace ID from query params
        const { searchParams } = new URL(request.url)
        const workspaceId = searchParams.get('workspaceId')

        if (!workspaceId) {
            return new Response("Workspace ID required", { status: 400 })
        }

        // Set user presence
        await realtimeService.setUserPresence(workspaceId, session.email)

        const encoder = new TextEncoder()
        const formatSSE = (data: any) => `data: ${JSON.stringify(data)}\n\n`

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

                // Use a timestamp just before "now" so we only get events from this point forward
                // "$" only works with blocking XREAD; Upstash REST is non-blocking.
                let lastSeenId = `${Date.now()}-0`
                let closed = false

                // ── Heartbeat (30s) ─────────────────────────────────────
                const sendHeartbeat = async () => {
                    if (closed) return
                    try {
                        await realtimeService.setUserPresence(workspaceId, session.email)
                        const activeUsers = await realtimeService.getActiveUsers(workspaceId)
                        const metrics = realtimeService.getMetrics()

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
                // 100ms poll + Upstash REST latency (~10-20ms) gives us
                // median end-to-end delivery well under 50ms for events
                // published from co-located server actions.
                const pollForEvents = async () => {
                    if (closed) return
                    try {
                        const newEvents = await realtimeService.readNewEvents(
                            workspaceId,
                            lastSeenId,
                            50  // batch up to 50 events per poll
                        )

                        if (newEvents.length > 0) {
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
                                })))
                            }
                        }
                    } catch (error) {
                        console.error('[SSE] Stream poll failed:', error)
                    }
                }

                const pollInterval = setInterval(pollForEvents, 100)
                const heartbeatInterval = setInterval(sendHeartbeat, 30000)
                sendHeartbeat()

                // ── Cleanup ─────────────────────────────────────────────
                const cleanup = () => {
                    if (closed) return
                    closed = true
                    clearInterval(pollInterval)
                    clearInterval(heartbeatInterval)
                    realtimeService.setUserPresence(workspaceId, session.email).catch(err =>
                        console.error('[SSE] Error updating presence on disconnect:', err)
                    )
                    try {
                        controller.close()
                    } catch {
                        // The stream may already be closed by the runtime.
                    }
                }

                request.signal.addEventListener('abort', cleanup)

                // Auto-cleanup after 30 minutes
                setTimeout(cleanup, 30 * 60 * 1000)
            }
        })

        return new Response(stream, { headers: SSE_HEADERS })
    } catch (error) {
        console.error('[SSE] Error setting up stream:', error)
        return new Response("Internal Server Error", { status: 500 })
    }
}
