"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { normalizeRealtimeEvent, type RealtimeEvent } from '@/lib/realtime-event'
import { shouldProcessEvent } from '@/lib/realtime-sse'

interface UseRealtimeOptions {
    workspaceId: string
    onTaskCreated?: (data: any) => void
    onTaskUpdated?: (data: any) => void
    onTaskDeleted?: (data: any) => void
    onTaskToggled?: (data: any) => void
    onTaskCommentCreated?: (data: any) => void
    onUserJoined?: (data: any) => void
    onUserLeft?: (data: any) => void
    onResyncRequired?: () => void
    onError?: (error: Event) => void
}

export function useRealtime(options: UseRealtimeOptions) {
    const [isConnected, setIsConnected] = useState(false)
    const [activeUsers, setActiveUsers] = useState<string[]>([])
    const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)
    const [eventRevision, setEventRevision] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const eventSourceRef = useRef<EventSource | null>(null)
    const optionsRef = useRef(options)
    const seenEventIdsRef = useRef(new Set<string>())
    const lossRevalidatedRef = useRef(false)

    useEffect(() => {
        optionsRef.current = options
    }, [options])

    const handleEvent = useCallback((event: RealtimeEvent) => {
        setLastEvent(event)
        setEventRevision(value => value + 1)
        const currentOptions = optionsRef.current

        switch (event.type) {
            case 'workspace-created':
            case 'workspace-updated':
            case 'invitation-updated':
            case 'member-added':
            case 'member-removed':
                currentOptions.onResyncRequired?.()
                break
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
            case 'task-comment-created':
                currentOptions.onTaskCommentCreated?.(event)
                break
            case 'user-joined':
                currentOptions.onUserJoined?.(event)
                break
            case 'user-left':
                currentOptions.onUserLeft?.(event)
                break
        }
    }, [])

    // A policy revocation can close the stream before its domain event is delivered.
    // Revalidate once per outage; native retry errors must not create a refresh storm.
    const revalidateAfterLoss = useCallback(() => {
        if (lossRevalidatedRef.current) return
        lossRevalidatedRef.current = true
        setEventRevision(value => value + 1)
        optionsRef.current.onResyncRequired?.()
    }, [])

    const connect = useCallback(() => {
        try {
            // Close any existing connection first
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
                eventSourceRef.current = null
            }

            const url = `/api/realtime?workspaceId=${encodeURIComponent(optionsRef.current.workspaceId)}`

            // withCredentials: true ensures the signed-in cookies are forwarded
            // on Vercel and other edge deployments where same-origin cookie
            // forwarding is not guaranteed without explicit opt-in.
            const eventSource = new EventSource(url, { withCredentials: true })
            eventSourceRef.current = eventSource

            eventSource.onopen = () => {
                if (eventSourceRef.current !== eventSource) return
                lossRevalidatedRef.current = false
                setEventRevision(value => value + 1)
                optionsRef.current.onResyncRequired?.()
                setIsConnected(true)
                setError(null)
            }

            eventSource.onmessage = (event) => {
                if (eventSourceRef.current !== eventSource) return
                try {
                    const data = JSON.parse(event.data)
                    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return

                    if (data.type === 'connected') {
                        lossRevalidatedRef.current = false
                        console.log('[Realtime] Connected to workspace:', optionsRef.current.workspaceId)
                        setIsConnected(true)
                        setError(null)
                    } else if (data.type === 'error') {
                        setIsConnected(false)
                        setError(typeof data.data?.message === 'string' && data.data.message ? data.data.message : 'Realtime updates are temporarily unavailable')
                        revalidateAfterLoss()
                    } else if (data.type === 'heartbeat') {
                        lossRevalidatedRef.current = false
                        setIsConnected(true)
                        setError(null)
                        if (Array.isArray(data.data?.activeUsers) && data.data.activeUsers.every((user: unknown) => typeof user === 'string')) {
                            setActiveUsers(data.data.activeUsers)
                        }
                    } else if (data.type === 'resync-required') {
                        lossRevalidatedRef.current = false
                        setEventRevision(value => value + 1)
                        setIsConnected(true)
                        setError('Refreshing after a missed realtime update')
                        optionsRef.current.onResyncRequired?.()
                    } else {
                        // EventSource inherits IDs for idless controls. Only persisted
                        // domain notifications participate in replay deduplication.
                        const domainEvent = normalizeRealtimeEvent({ type: data.type, workspaceId: data.workspaceId, userId: data.userId, timestamp: data.timestamp, data: data.data })
                        if (domainEvent.workspaceId !== optionsRef.current.workspaceId) return
                        if (!shouldProcessEvent(seenEventIdsRef.current, event.lastEventId)) return
                        lossRevalidatedRef.current = false
                        setIsConnected(true)
                        setError(null)
                        handleEvent(domainEvent)
                    }
                } catch (err) {
                    console.error('[Realtime] Failed to parse SSE message:', err)
                }
            }

            eventSource.onerror = (event) => {
                if (eventSourceRef.current !== eventSource) return
                console.error('[Realtime] SSE connection error:', event)
                setIsConnected(false)
                setError('Connection lost')
                revalidateAfterLoss()
                optionsRef.current.onError?.(event)
            }

        } catch (err) {
            console.error('[Realtime] Failed to create SSE connection:', err)
            setError('Failed to connect')
            revalidateAfterLoss()
        }
    }, [handleEvent, revalidateAfterLoss])

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
        }
        setIsConnected(false)
    }, [])

    useEffect(() => {
        const handleOnline = () => connect()
        if (options.workspaceId) {
            seenEventIdsRef.current.clear()
            lossRevalidatedRef.current = false
            connect()
            window.addEventListener('online', handleOnline)
        }

        return () => {
            window.removeEventListener('online', handleOnline)
            disconnect()
        }
    }, [options.workspaceId, connect, disconnect])

    return {
        isConnected,
        activeUsers,
        lastEvent,
        eventRevision,
        error,
        connect,
        disconnect
    }
}
