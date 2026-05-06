// SSE utility module for formatting Server-Sent Events messages.

export interface SSEMessage {
  id?: string
  type: string
  data: any
  timestamp: number
  deliveredAt?: number
  latencyMs?: number | null
}

/**
 * Format an SSE message string from structured data.
 */
export function formatSSEMessage(data: SSEMessage): string {
  const lines: string[] = []

  if (data.id) {
    lines.push(`id: ${data.id}`)
  }

  if (data.type) {
    lines.push(`event: ${data.type}`)
  }

  lines.push(`data: ${JSON.stringify(data)}`)
  lines.push("") // trailing newline
  lines.push("") // double newline to terminate the message

  return lines.join("\n")
}

/**
 * Create a ReadableStream controller helper for SSE.
 */
export function createSSEStream() {
  const encoder = new TextEncoder()

  return {
    encoder,
    encode: (message: SSEMessage) => encoder.encode(formatSSEMessage(message)),
    encodeRaw: (data: any) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
    encodeRetry: (ms: number) => encoder.encode(`retry: ${ms}\n\n`),
  }
}