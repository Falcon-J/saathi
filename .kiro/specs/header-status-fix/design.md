# Design Document

## Overview

This design addresses the inaccurate status indicators in the Saathi dashboard header by implementing proper network detection, API health monitoring, and sync state management. The solution enhances the existing `useCollaboration` hook and updates the dashboard header to provide accurate, actionable status information.

## Architecture

### Enhanced State Management

The `useCollaboration` hook will be extended with additional state tracking:

```typescript
interface CollaborationState {
  // Existing
  activities: Activity[];
  activeUsers: User[];
  isOnline: boolean;

  // New status tracking
  connectionState: "online" | "offline" | "issues";
  syncState: "active" | "paused" | "reconnecting";
  lastSyncTime: number;
  retryCount: number;
  isRetrying: boolean;
}
```

### Connection Detection Strategy

1. **Network Detection**: Use `navigator.onLine` for basic connectivity
2. **API Health Check**: Monitor API response patterns and timing
3. **Graceful Degradation**: Distinguish between network vs server issues

### Sync State Logic

- **Active**: Recent successful API calls (< 10 seconds)
- **Paused**: Failed API calls or stale data (> 30 seconds)
- **Reconnecting**: Actively attempting to restore connection

## Components and Interfaces

### Enhanced useCollaboration Hook

```typescript
export function useCollaboration(workspaceId: string | null, enabled: boolean) {
  // Enhanced state management
  const [connectionState, setConnectionState] = useState<
    "online" | "offline" | "issues"
  >("online");
  const [syncState, setSyncState] = useState<
    "active" | "paused" | "reconnecting"
  >("paused");
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  // Network status monitoring
  const checkNetworkStatus = () => {
    return navigator.onLine;
  };

  // Enhanced polling with health checks
  const pollActivities = async () => {
    // Implementation with proper error handling and state updates
  };

  // Manual retry functionality
  const retryConnection = async () => {
    // Implementation with rate limiting
  };

  return {
    // Existing returns
    activities,
    activeUsers,
    isOnline,
    // New status information
    connectionState,
    syncState,
    lastSyncTime,
    retryConnection,
    isRetrying,
  };
}
```

### Status Indicator Components

#### Connection Status Indicator

- Green + Wifi icon: "Online" (network + API working)
- Red + WifiOff icon: "Offline" (no network)
- Yellow + AlertTriangle icon: "Connection Issues" (network ok, API failing)

#### Sync Status Indicator

- Blue + active animation: "Real-time sync" (recent successful sync)
- Gray + static: "Sync paused" (failed/stale sync)
- Blue + loading animation: "Reconnecting..." (retry in progress)

### Retry Mechanism

- Manual retry button appears during connection issues
- Rate limiting: max 3 attempts per minute
- Exponential backoff for automatic retries
- Visual feedback during retry attempts

## Data Models

### Connection State Enum

```typescript
type ConnectionState = "online" | "offline" | "issues";
```

### Sync State Enum

```typescript
type SyncState = "active" | "paused" | "reconnecting";
```

### Status Timing Constants

```typescript
const SYNC_ACTIVE_THRESHOLD = 10000; // 10 seconds
const SYNC_STALE_THRESHOLD = 30000; // 30 seconds
const RETRY_COOLDOWN = 60000; // 1 minute
const MAX_RETRIES_PER_MINUTE = 3;
```

## Error Handling

### Network Error Classification

1. **Network Unavailable**: `navigator.onLine === false`
2. **API Unreachable**: Network available but API calls fail
3. **API Errors**: API responds with error status codes
4. **Timeout Errors**: API calls exceed reasonable time limits

### Retry Strategy

- Immediate retry for transient network issues
- Exponential backoff for persistent API failures
- User-initiated retry with rate limiting
- Automatic background retry every 30 seconds when paused

### Graceful Degradation

- Show cached data when sync is paused
- Maintain basic functionality during connection issues
- Clear error messaging with actionable next steps

## Testing Strategy

### Unit Tests

- Connection state transitions
- Retry logic and rate limiting
- Status indicator rendering
- Error handling scenarios

### Integration Tests

- API failure simulation
- Network connectivity changes
- End-to-end status indicator behavior
- User interaction flows (retry button)

### Manual Testing Scenarios

1. Disconnect network → verify offline status
2. Block API endpoint → verify connection issues status
3. Restore connectivity → verify automatic recovery
4. Test retry button functionality and rate limiting
5. Verify sync status accuracy during various network conditions
