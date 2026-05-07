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
    const optionsRef = useRef(options)

    useEffect(() => {
        optionsRef.current = options
    }, [options])

    const handleEvent = useCallback((event: RealtimeEvent) => {
        setLastEvent(event)
        const currentOptions = optionsRef.current

        switch (event.type) {
            case 'task-created':
                currentOptions.onTaskCreated?.(event)
                break
            case 'task-updated':
                currentOptions.onTaskUpdated?.(event)
                break
            case 'task-deleted':
                currentOptions.onTaskDeleted?.(event)
                break
            case 'task-toggled':
                currentOptions.onTaskToggled?.(event)
                break
            case 'user-joined':
                currentOptions.onUserJoined?.(event)
                break
            case 'user-left':
                currentOptions.onUserLeft?.(event)
                break
        }
    }, [])

    const connect = useCallback(() => {
        try {
            // Close any existing connection first
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
                eventSourceRef.current = null
            }

            const url = `/api/realtime?workspaceId=${encodeURIComponent(optionsRef.current.workspaceId)}`

            // withCredentials: true ensures the auth-session cookie is forwarded
            // on Vercel and other edge deployments where same-origin cookie
            // forwarding is not guaranteed without explicit opt-in.
            const eventSource = new EventSource(url, { withCredentials: true })
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
                        console.log('[Realtime] Connected to workspace:', optionsRef.current.workspaceId)
                        setIsConnected(true)
                    } else if (data.type === 'heartbeat') {
                        if (data.data?.activeUsers) {
                            setActiveUsers(data.data.activeUsers)
                        }
                    } else {
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
                optionsRef.current.onError?.(event)
            }

        } catch (err) {
            console.error('[Realtime] Failed to create SSE connection:', err)
            setError('Failed to connect')
        }
    }, [handleEvent])

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
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
