// Server-Sent Events helper utilities

export interface SSEMessage {
    type: string
    data?: any
    id?: string
    retry?: number
}

export function formatSSEMessage(message: SSEMessage): string {
    let formatted = ''

    if (message.id) {
        formatted += `id: ${message.id}\n`
    }

    if (message.retry) {
        formatted += `retry: ${message.retry}\n`
    }

    formatted += `event: ${message.type}\n`
    formatted += `data: ${JSON.stringify(message.data || {})}\n\n`

    return formatted
}

export function createSSEResponse(): {
    stream: ReadableStream
    controller: ReadableStreamDefaultController
    encoder: TextEncoder
} {
    const encoder = new TextEncoder()
    let controller: ReadableStreamDefaultController

    const stream = new ReadableStream({
        start(ctrl) {
            controller = ctrl

            // Send initial connection message
            const message = formatSSEMessage({
                type: 'connected',
                data: { timestamp: Date.now() }
            })
            controller.enqueue(encoder.encode(message))
        }
    })

    return { stream, controller: controller!, encoder }
}

export function sendSSEMessage(
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    message: SSEMessage
) {
    try {
        const formatted = formatSSEMessage(message)
        controller.enqueue(encoder.encode(formatted))
    } catch (error) {
        console.error('Failed to send SSE message:', error)
    }
}

export function createSSEHeaders(): HeadersInit {
    return {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control'
    }
}