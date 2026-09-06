# ADR 0001: PostgreSQL Owns Durable Product State

- Status: Accepted
- Date: 2026-09-04

## Context

Saathi currently stores accounts, sessions, workspace metadata, and members in Redis, maintains user-to-workspace and workspace-to-task indexes manually, and performs several mutations as read-check-write sequences. This makes authentication maintenance, relational invariants, multi-entity transactions, concurrent updates, and future schema evolution difficult to guarantee. The product now requires managed authentication, editable workspace metadata, reliable invitations, task assignment, audit history, and predictable realtime recovery.

## Decision

Use Supabase Auth as the authority for identity, passwords, verification, recovery, and sessions. Use Supabase PostgreSQL as the authoritative store for Saathi profiles, workspaces, memberships, invitations, tasks, activity events, and realtime outbox events.

Keep Upstash Redis for:

- distributed rate limits;
- short-lived idempotency and delivery claims;
- presence;
- Redis Streams consumed by SSE clients.

Use `@supabase/ssr` for Next.js cookie sessions and Supabase's PKCE flow. Use Drizzle ORM for typed schema/query construction and reviewed SQL migrations. Use the `postgres` driver with Supabase's transaction pooler for Vercel runtime traffic and a direct Supabase connection for migrations. The Supabase CLI runs the local Auth/PostgreSQL/Mailpit stack. Application domain mutations continue through Server Actions and Drizzle rather than direct browser database writes.

Use Upstash Redis for the retained Redis responsibilities. Keep Supabase, Upstash, and the Vercel functions in compatible nearby regions where the free-tier region choices permit it.

Do not dual-write durable data. During cutover, the old Redis records remain untouched for a short rollback window while the application reads and writes PostgreSQL exclusively.

## Consequences

### Positive

- Primary keys, foreign keys, checks, and partial unique indexes enforce core invariants.
- Workspace, membership, invitation, task, activity, and outbox changes can commit atomically.
- Future model changes use versioned migrations instead of destructive key rewrites.
- Upstash Redis is retained for the low-latency and expiring workloads it already serves well.
- Realtime loss cannot become data loss because clients reconcile from PostgreSQL.

### Costs

- The application operates two data systems with explicitly different responsibilities.
- Database migrations and connection management become release concerns.
- The first cutover intentionally resets current development data unless a separate import is approved.

## Rejected alternatives

### Keep the workspace JSON blob

Smallest immediate code change, but concurrent member and metadata writes can still overwrite one another, and every new query needs another Redis index.

### Normalize all durable data into Redis keys

Improves uniqueness through sets but still requires application-managed foreign keys, multi-key transactions, migrations, and audit consistency. It recreates relational database responsibilities in application code.

### Replace Upstash completely

Rejected because Redis Streams, rate limits, temporary claims, and presence remain a good fit and are already integrated with SSE.

## Rollback

Before production cutover, tag the last Redis-backed release and retain existing Redis durable keys without mutation. If PostgreSQL validation fails, redeploy that release. Do not attempt to merge writes made independently in both backends; cutover occurs only during a controlled no-user-data or explicitly announced reset window.
