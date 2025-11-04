import { NextRequest } from "next/server"
import { getSession } from "@/lib/auth-simple"
import { realtimeService } from "@/lib/realtime"

export async function GET(request: NextRequest) {
    try {
        // Verify authentication
        const session = await getSession()
        if (!session) {
            return new Response("Unauthorized", { status: 401 })
        }

        // Get workspace ID from query params
        const { searchParams } = new URL(request.url)
        const workspaceId = searchParams.get('workspaceId')

        if (!workspaceId) {
            return new Response("Workspace ID required", { status: 400 })
        }

        // Set user presence
        await realtimeService.setUserPresence(workspaceId, session.email)

        // Create SSE response
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            start(controller) {
                // Send initial connection message
                const connectEvent = {
                    type: 'connected',
                    timestamp: Date.now(),
                    data: { userId: session.email, workspaceId }
                }

                const data = `data: ${JSON.stringify(connectEvent)}\n\n`
                controller.enqueue(encoder.encode(data))

                // Track last event timestamp to avoid duplicates
                let lastEventTimestamp = Date.now()

                // Poll for new events every 1 second
                const pollInterval = setInterval(async () => {
                    try {
                        // Update user presence
                        await realtimeService.setUserPresence(workspaceId, session.email)

                        // Get latest event
                        const latestEvent = await realtimeService.getLatestEvent(workspaceId)

                        if (latestEvent && latestEvent.timestamp > lastEventTimestamp) {
                            lastEventTimestamp = latestEvent.timestamp

                            try {
                                const eventData = `data: ${JSON.stringify(latestEvent)}\n\n`
                                controller.enqueue(encoder.encode(eventData))
                            } catch (jsonError) {
                                console.error('[SSE] Failed to serialize event:', jsonError)
                            }
                        }

                        // Send heartbeat every 10 polls (10 seconds)
                        if (Date.now() % 10000 < 1000) {
                            const heartbeat = {
                                type: 'heartbeat',
                                timestamp: Date.now(),
                                data: { activeUsers: await realtimeService.getActiveUsers(workspaceId) }
                            }

                            const heartbeatData = `data: ${JSON.stringify(heartbeat)}\n\n`
                            controller.enqueue(encoder.encode(heartbeatData))
                        }
                    } catch (error) {
                        console.error('[SSE] Error in poll interval:', error)
                    }
                }, 1000) // Poll every 1 second

                // Cleanup on close
                const cleanup = () => {
                    clearInterval(pollInterval)
                    controller.close()
                }

                request.signal.addEventListener('abort', cleanup)

                // Auto-cleanup after 30 minutes
                setTimeout(cleanup, 30 * 60 * 1000)
            }
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Cache-Control'
            }
        })
    } catch (error) {
        console.error('[SSE] Error setting up stream:', error)
        return new Response("Internal Server Error", { status: 500 })
    }
}