# Saathi Performance & Load Testing Guide

## Real-Time Performance Improvements

### Latency Optimization
- **Previous Implementation**: 1000ms polling interval (SSE)
- **Current Implementation**: 100ms polling interval with Redis Streams
- **Expected Latency**: ~100-150ms for event propagation
- **Target Latency**: <50ms (requires WebSocket upgrade - see roadmap)

### Load Testing

#### Prerequisites
```bash
npm install -g k6
```

#### Run Load Test
```bash
# Basic load test (50-200 concurrent users)
k6 run scripts/loadtest.k6.js

# With custom base URL
BASE_URL=http://localhost:3000 k6 run scripts/loadtest.k6.js

# With extended test (more realistic patterns)
k6 run --vus 200 --duration 5m scripts/loadtest.k6.js
```

#### Performance Metrics Collected
- **create_task_duration**: Time to create a task (target: <500ms)
- **update_task_duration**: Time to update a task (target: <500ms)
- **sse_connection_latency**: Time to establish SSE connection
- **concurrent_users**: Current number of connected users
- **task_operations**: Total number of task operations performed

#### Load Test Results Interpretation

**Good Performance**:
- P95 latency: < 500ms
- P99 latency: < 1000ms
- Error rate: < 10%
- Throughput: > 100 ops/sec

**Thresholds**:
- If P95 exceeds 500ms, consider database optimization
- If error rate exceeds 10%, check Redis connection limits
- If throughput drops significantly, consider scaling

## Redis Streams Implementation

### Stream Service
File: `lib/redis-streams.ts`

Provides emulated Redis Streams functionality:
- `XADD`: Append entry to stream
- `XREAD`: Read entries from stream
- `XTRIM`: Trim stream to maximum length

```typescript
import { streamService } from '@/lib/redis-streams'

// Add event to stream
await streamService.xadd('mystream', { type: 'event', data: {} })

// Read recent events
const events = await streamService.xread('mystream', '0', 10)

// Trim stream
await streamService.xtrim('mystream', 1000)
```

## Real-Time Service

### Realtime Service
File: `lib/realtime.ts`

Enhanced event-driven architecture:
- Publishes events to Redis Streams
- Manages user presence with TTL
- Provides event history retrieval

```typescript
import { realtimeService } from '@/lib/realtime'

// Publish event
await realtimeService.publishEvent({
  type: 'task-created',
  workspaceId: 'ws-123',
  userId: 'user@example.com',
  data: { taskId: 't-456' }
})

// Get active users
const activeUsers = await realtimeService.getActiveUsers('ws-123')
```

## SSE Endpoint Improvements

### Reduced Polling Interval
File: `app/api/realtime/route.ts`

- Changed from 1000ms to 100ms polling interval
- Improved event delivery latency by 10x
- Added `X-Accel-Buffering: no` header for real-time delivery

### Usage
```typescript
// Client-side hook usage
import { useSSE } from '@/hooks/useSSE'

const { isConnected, error } = useSSE(
  '/api/realtime?workspaceId=ws-123',
  {
    onMessage: (event) => console.log('Update:', event),
    onError: (error) => console.error('Error:', error),
    reconnectInterval: 3000
  }
)
```

## Future Optimizations

### WebSocket Support (Roadmap)
To achieve true <50ms latency:
1. Implement Socket.io or native WebSocket server
2. Replace polling with push-based updates
3. Reduce latency to ~10-20ms

### Database Optimization
1. Index frequently queried fields
2. Implement connection pooling
3. Add caching layer (Redis cache in addition to streams)

### Scaling
1. Implement Redis clustering
2. Add load balancer
3. Deploy to multiple regions

## Monitoring & Observability

### Key Metrics
- Event latency: Time from publish to client delivery
- Connection uptime: Percentage of time SSE connection is active
- User presence accuracy: Percentage of active users correctly tracked
- Task operation latency: P50, P95, P99 percentiles

### Logs to Monitor
```
[Realtime] Published event: [type] for workspace [id]
[SSE] Error in poll interval: [error]
[StreamService] XADD: [streamKey] -> [id]
```

## Validation Checklist

- ✅ Redis Streams emulation working
- ✅ 100ms polling interval configured
- ✅ Event publishing to Redis Streams
- ✅ Load test script included
- ✅ User presence tracking
- ✅ Event history retrieval
- ⏳ WebSocket upgrade (future)
- ⏳ <50ms latency target (requires WebSocket)

## Support

For issues or questions:
1. Check Redis connection status
2. Verify polling interval in `/api/realtime`
3. Monitor real-time latency in browser DevTools
4. Run load test to identify bottlenecks
