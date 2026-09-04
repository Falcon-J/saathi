# Saathi realtime contract

## Event envelope

Published events contain:

```json
{
  "type": "task-updated",
  "workspaceId": "workspace_123",
  "userId": "user@example.com",
  "timestamp": 1788516000000,
  "data": { "task": { "id": "task_123" } }
}
```

Redis assigns the stable Stream ID. The SSE response emits that ID as the SSE `id:` field and includes it in the client delivery path. Payloads are validated before publication and malformed retained entries are dropped rather than trusted.

## Stream and ordering

Each workspace uses `stream:{workspaceId}`. Events are ordered by Redis Stream ID within that workspace. Streams are bounded to the latest 1,000 entries. This limits storage and makes replay finite; it does not provide an infinite audit log.

## SSE lifecycle

`GET /api/realtime?workspaceId=...` requires the httpOnly session cookie and current workspace membership. The route sends SSE headers, a connection message, a one-second browser retry hint, bounded 100ms polling, and a 30-second heartbeat. Per-user connection attempts and concurrent connections are rate-limited with expiring Redis leases. Request abort or stream cancellation clears intervals, the lease, and the 30-minute safety timer; each connection allows only one poll in flight.

## Reconnect and delivery guarantees

The browser reconnects with `Last-Event-ID`. If that cursor is still retained, the route reads entries after it. Delivery is at-least-once: network retries can repeat an event, so clients deduplicate by SSE ID and task reconciliation remains idempotent.

If the cursor is older than the oldest retained entry, the route emits `resync-required` and the workspace hook refetches authoritative tasks. Saathi does not claim exactly-once delivery. If Redis history has expired, the authoritative task read is the recovery path.

## Isolation

The route checks the session and workspace membership before opening the stream. Every event is stored under the requested workspace stream, and the client ignores events for a different selected workspace. Client controls are not an authorization boundary; Server Actions perform their own checks.
