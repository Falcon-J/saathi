"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
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
    const optionsRef = useRef(options)

    useEffect(() => {
        optionsRef.current = options
    }, [options])

    const connect = useCallback(() => {
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
                optionsRef.current?.onOpen?.()
            }

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as SSEEvent
                    optionsRef.current?.onMessage?.(data)
                } catch (err) {
                    console.error('Failed to parse SSE message:', err)
                }
            }

            eventSource.onerror = (event) => {
                console.error('SSE connection error:', event)
                setIsConnected(false)
                setError('Connection lost')
                optionsRef.current?.onError?.(event)
            }

        } catch (err) {
            console.error('Failed to create SSE connection:', err)
            setError('Failed to connect')
        }
    }, [url])

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
        }

        setIsConnected(false)
    }, [])

    useEffect(() => {
        connect()

        return () => {
            disconnect()
        }
    }, [connect, disconnect])

    return {
        isConnected,
        error,
        connect,
        disconnect
    }
}
