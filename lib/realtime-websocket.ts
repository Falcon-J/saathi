// WebSocket server implementation for real-time updates with <50ms latency
// This replaces the polling-based SSE approach

import { redis } from "./redis"
import { streamService } from "./redis-streams"

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'event' | 'heartbeat' | 'presence' | 'error'
  workspaceId?: string
  userId?: string
  data?: any
  timestamp: number
  clientId?: string
}

// In-memory store for active WebSocket connections
// In production, this would use a distributed cache or message broker
class WebSocketConnectionManager {
  private static instance: WebSocketConnectionManager
  private connections = new Map<string, Set<any>>() // workspaceId -> Set of connections
  private userPresence = new Map<string, { workspaceId: string; userId: string; timestamp: number }>()

  static getInstance(): WebSocketConnectionManager {
    if (!WebSocketConnectionManager.instance) {
      WebSocketConnectionManager.instance = new WebSocketConnectionManager()
    }
    return WebSocketConnectionManager.instance
  }

  // Register a new WebSocket connection
  addConnection(workspaceId: string, userId: string, socket: any): string {
    const clientId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    if (!this.connections.has(workspaceId)) {
      this.connections.set(workspaceId, new Set())
    }
    
    this.connections.get(workspaceId)!.add({ socket, userId, clientId })
    this.userPresence.set(clientId, { workspaceId, userId, timestamp: Date.now() })
    
    console.log(`[WebSocket] User ${userId} connected to workspace ${workspaceId} (${clientId})`)
    return clientId
  }

  // Remove a WebSocket connection
  removeConnection(workspaceId: string, clientId: string): void {
    const connections = this.connections.get(workspaceId)
    if (connections) {
      const connToRemove = Array.from(connections).find(c => c.clientId === clientId)
      if (connToRemove) {
        connections.delete(connToRemove)
        console.log(`[WebSocket] Client ${clientId} disconnected from workspace ${workspaceId}`)
      }
    }
    this.userPresence.delete(clientId)
  }

  // Get all connections for a workspace
  getWorkspaceConnections(workspaceId: string): any[] {
    return Array.from(this.connections.get(workspaceId) || new Set())
  }

  // Get active users in a workspace
  getActiveUsers(workspaceId: string): string[] {
    const connections = this.connections.get(workspaceId) || new Set()
    return Array.from(connections).map((c: any) => c.userId)
  }

  // Broadcast message to all clients in a workspace
  async broadcast(workspaceId: string, message: WebSocketMessage): Promise<void> {
    const connections = this.getWorkspaceConnections(workspaceId)
    
    if (connections.length === 0) {
      console.log(`[WebSocket] No active connections for workspace ${workspaceId}`)
      return
    }
    
    const messageStr = JSON.stringify(message)
    let successCount = 0
    let failureCount = 0
    
    for (const conn of connections) {
      try {
        if (conn.socket && conn.socket.send) {
          conn.socket.send(messageStr)
          successCount++
        }
      } catch (error) {
        console.error(`[WebSocket] Failed to send message to client ${conn.clientId}:`, error)
        failureCount++
      }
    }
    
    console.log(`[WebSocket] Broadcast to ${workspaceId}: ${successCount} sent, ${failureCount} failed`)
  }
}

// Real-time service with WebSocket support
export class RealtimeWebSocketService {
  private static instance: RealtimeWebSocketService
  private connManager = WebSocketConnectionManager.getInstance()

  static getInstance(): RealtimeWebSocketService {
    if (!RealtimeWebSocketService.instance) {
      RealtimeWebSocketService.instance = new RealtimeWebSocketService()
    }
    return RealtimeWebSocketService.instance
  }

  // Publish event to Redis Stream AND broadcast via WebSocket
  async publishEvent(event: any): Promise<void> {
    try {
      const timestamp = Date.now()
      const eventWithTimestamp = { ...event, timestamp }
      
      // Store in Redis Stream
      const streamKey = `stream:${event.workspaceId}`
      await streamService.xadd(streamKey, eventWithTimestamp)
      
      // Broadcast via WebSocket to all connected clients
      await this.connManager.broadcast(event.workspaceId, {
        type: 'event',
        workspaceId: event.workspaceId,
        data: eventWithTimestamp,
        timestamp
      })
      
      console.log(`[RealtimeWS] Published ${event.type} to workspace ${event.workspaceId}`)
    } catch (error) {
      console.error('[RealtimeWS] Failed to publish event:', error)
    }
  }

  // Handle user presence
  async updatePresence(workspaceId: string, userId: string): Promise<void> {
    try {
      const presenceKey = `presence:${workspaceId}`
      await redis.set(`${presenceKey}:${userId}`, Date.now().toString(), { ex: 300 })
      
      const activeUsers = this.connManager.getActiveUsers(workspaceId)
      
      // Broadcast presence update
      await this.connManager.broadcast(workspaceId, {
        type: 'presence',
        workspaceId,
        data: { activeUsers, userId },
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('[RealtimeWS] Failed to update presence:', error)
    }
  }

  // Get connection manager for WebSocket route
  getConnectionManager(): typeof WebSocketConnectionManager {
    return WebSocketConnectionManager
  }

  // Get active users
  async getActiveUsers(workspaceId: string): Promise<string[]> {
    return this.connManager.getActiveUsers(workspaceId)
  }
}

export const realtimeWsService = RealtimeWebSocketService.getInstance()
