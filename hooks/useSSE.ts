"use client"

import { useEffect, useRef, useState } from 'react'
import { SSEEvent } from '@/lib/types'

export function useSSE(url: string, options?: {
    onMessage?: (event: SSEEvent) => void
    onError?: (error: Event) => void
    onOpen?: () => void
    reconnectInterval?: number
}) {
    const [isConnected, setIsConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const eventSourceRef = useRef<EventSource | null>(null)

    const connect = () => {
        try {
            // Close existing connection
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
            }

            const eventSource = new EventSource(url, { withCredentials: true })
            eventSourceRef.current = eventSource

            eventSource.onopen = () => {
                console.log('SSE connection opened')
                setIsConnected(true)
                setError(null)
                options?.onOpen?.()
            }

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as SSEEvent
                    options?.onMessage?.(data)
                } catch (err) {
                    console.error('Failed to parse SSE message:', err)
                }
            }

            eventSource.onerror = (event) => {
                console.error('SSE connection error:', event)
                setIsConnected(false)
                setError('Connection lost')
                options?.onError?.(event)
            }

        } catch (err) {
            console.error('Failed to create SSE connection:', err)
            setError('Failed to connect')
        }
    }

    const disconnect = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
        }

        setIsConnected(false)
    }

    useEffect(() => {
        connect()

        return () => {
            disconnect()
        }
    }, [url])

    return {
        isConnected,
        error,
        connect,
        disconnect
    }
}
