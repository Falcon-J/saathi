"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { RealtimeEvent } from '@/lib/realtime'

interface UseRealtimeOptions {
    workspaceId: string
    onTaskCreated?: (data: any) => void
    onTaskUpdated?: (data: any) => void
    onTaskDeleted?: (data: any) => void
    onTaskToggled?: (data: any) => void
    onUserJoined?: (data: any) => void
    onUserLeft?: (data: any) => void
    onError?: (error: Event) => void
}

export function useRealtime(options: UseRealtimeOptions) {
    const [isConnected, setIsConnected] = useState(false)
    const [activeUsers, setActiveUsers] = useState<string[]>([])
    const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)
    const [error, setError] = useState<string | null>(null)

    const eventSourceRef = useRef<EventSource | null>(null)
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const reconnectInterval = 3000

    const handleEvent = useCallback((event: RealtimeEvent) => {
        setLastEvent(event)

        switch (event.type) {
            case 'task-created':
                options.onTaskCreated?.(event.data)
                break
            case 'task-updated':
                options.onTaskUpdated?.(event.data)
                break
            case 'task-deleted':
                options.onTaskDeleted?.(event.data)
                break
            case 'task-toggled':
                options.onTaskToggled?.(event.data)
                break
            case 'user-joined':
                options.onUserJoined?.(event.data)
                break
            case 'user-left':
                options.onUserLeft?.(event.data)
                break
        }
    }, [options])

    const connect = useCallback(() => {
        try {
            // Close existing connection
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
            }

            const url = `/api/realtime?workspaceId=${encodeURIComponent(options.workspaceId)}`
            const eventSource = new EventSource(url)
            eventSourceRef.current = eventSource

            eventSource.onopen = () => {
                console.log('[Realtime] SSE connection opened')
                setIsConnected(true)
                setError(null)
            }

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)

                    if (data.type === 'connected') {
                        console.log('[Realtime] Connected to workspace:', options.workspaceId)
                    } else if (data.type === 'heartbeat') {
                        // Update active users from heartbeat
                        if (data.data?.activeUsers) {
                            setActiveUsers(data.data.activeUsers)
                        }
                    } else {
                        // Handle real-time events
                        handleEvent(data as RealtimeEvent)
                    }
                } catch (err) {
                    console.error('[Realtime] Failed to parse SSE message:', err)
                }
            }

            eventSource.onerror = (event) => {
                console.error('[Realtime] SSE connection error:', event)
                setIsConnected(false)
                setError('Connection lost')
                options.onError?.(event)

                // Attempt to reconnect after a delay
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current)
                }

                reconnectTimeoutRef.current = setTimeout(() => {
                    console.log('[Realtime] Attempting to reconnect...')
                    connect()
                }, reconnectInterval)
            }

        } catch (err) {
            console.error('[Realtime] Failed to create SSE connection:', err)
            setError('Failed to connect')
        }
    }, [options.workspaceId, handleEvent, options])

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
        }

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
        }

        setIsConnected(false)
    }, [])

    useEffect(() => {
        if (options.workspaceId) {
            connect()
        }

        return () => {
            disconnect()
        }
    }, [options.workspaceId, connect, disconnect])

    return {
        isConnected,
        activeUsers,
        lastEvent,
        error,
        connect,
        disconnect
    }
}