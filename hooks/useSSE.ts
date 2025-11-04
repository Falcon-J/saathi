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
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const reconnectInterval = options?.reconnectInterval || 3000

    const connect = () => {
        try {
            // Close existing connection
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
            }

            const eventSource = new EventSource(url)
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

                // Attempt to reconnect after a delay
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current)
                }

                reconnectTimeoutRef.current = setTimeout(() => {
                    console.log('Attempting to reconnect SSE...')
                    connect()
                }, reconnectInterval)
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

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
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