# Saathi reliability notes

## Current guarantees

- Unauthenticated and non-member realtime subscriptions are rejected.
- Task mutation inputs and event payloads are validated at server boundaries.
- Task and workspace edits use database version checks (legacy timestamps remain accepted by task compatibility callers).
- Redis Streams are bounded and cursor-addressable.
- SSE reconnects preserve the browser cursor and detect replay gaps.
- Duplicate event IDs are ignored by the client.
- Task mutation attempts use a Redis-backed fixed-window limit.
- Liveness and readiness are separate at `/api/health/live` and `/api/health/ready`.

## Known boundary

Durable mutations and their outbox events commit in one PostgreSQL transaction. Realtime publication is retryable and best effort: if Redis is unavailable after the commit, the authoritative read still succeeds and a later outbox run publishes the notification. Clients reconcile against PostgreSQL after reconnect or a replay gap.

## Observability

The current code records publish latency and logs workspace-scoped failures without printing passwords or tokens. Process-local counters are diagnostic only in serverless deployments; they are not a replacement for centralized metrics. Production evidence should record request, event, workspace, and task identifiers in a sanitized structured log format before numeric SLO claims are made.

## Abuse protection

Invitation and task mutation limits use Redis counters. Email delivery uses immutable queued payloads, provider idempotency keys, bounded retries, and terminal suppression after bounce or complaint. Limits are intentionally targeted rather than applied to every read. Rate-limit responses are explicit and include a retry duration without exposing internal keys.
