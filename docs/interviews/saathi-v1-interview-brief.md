# Saathi v1 — interview brief

## 30-second pitch

Saathi is a small-team workspace that turns a shared outcome into assigned, visible, and completed work. It combines workspace membership, task execution, comments, activity history, realtime reconciliation, and optional AI assistance while keeping PostgreSQL authoritative and every mutation server-authorized.

## Architecture in one minute

Saathi is a Next.js modular monolith. Supabase Auth provides identity and sessions. Server Actions and route handlers verify the session and current workspace membership before calling domain/data modules. PostgreSQL stores workspaces, memberships, tasks, comments, activity, and outbox obligations transactionally. Upstash Redis and SSE are delivery-only infrastructure for rate limits and realtime notifications; clients reconcile durable state from PostgreSQL after reconnects or missed events. Resend handles invitation delivery. Groq is an optional server-only adapter for bounded advice and reviewed drafts.

```text
Browser
  -> Server Action / route
  -> session + membership authorization
  -> domain/data module
  -> PostgreSQL transaction
  -> activity + outbox obligation
  -> Redis/SSE notification
  -> client reconciliation from PostgreSQL
```

## Authority boundaries

| Question | Authority |
| --- | --- |
| Who is this user? | Supabase Auth, verified server-side |
| Can they access this workspace? | Current PostgreSQL membership |
| Did a task change? | PostgreSQL transaction result |
| Did collaborators receive a notification? | Redis/SSE delivery state, never domain truth |
| Did email reach an inbox? | Provider events plus application delivery state; provider acceptance alone is insufficient |
| What may AI do? | Interpret an authorized projection and draft advice; it cannot authorize or persist by itself |

## Authorization model

Every workspace read, task read, comment operation, realtime subscription, and AI request derives identity from the verified server session and checks current membership. Owner/editor/member permissions are enforced at the application/data boundary. A non-member must receive a forbidden/no-data result even if they know a workspace or task identifier; identifiers are not authorization.

## Optimistic concurrency

Task mutations carry the version the client last observed. The database update succeeds only when that version still matches. A stale client receives a conflict instead of silently overwriting a newer edit. The UI can then reload the authoritative row and let the user decide what to do.

## Realtime failure model

The durable mutation and its activity/outbox obligation are committed in PostgreSQL first. Redis/SSE publishes a notification after that durable state exists. If publication fails, the mutation is still recoverable and the outbox item remains retryable. On disconnect or missed events, the browser reconciles from PostgreSQL rather than assuming the event stream is complete.

## AI safety boundary

AI receives only the minimum authorized workspace projection. Its structured output is validated and treated as advice or a reviewed draft. A user must explicitly confirm a draft, after which the normal deterministic task command re-checks authorization, validation, and persistence. AI cannot create a membership, bypass permissions, claim a mutation succeeded, or become the source of truth.

## Key tradeoffs

- A modular monolith keeps transaction and authorization ownership easy to trace while the product is small; separate services would add operational cost without evidence of a current bottleneck.
- PostgreSQL is deliberately authoritative even though Redis makes realtime delivery faster; this makes reconnects and delivery failures recoverable.
- AI is optional and off by default so the core workflow remains useful when provider credentials, quotas, or output quality are unavailable.
- Optimistic concurrency favors explicit user-visible conflicts over silent last-write-wins data loss.
- The v1 scope intentionally excludes organizations, subtasks, labels, attachments, billing, autonomous AI writes, and durable AI conversation history.

## Evidence to state honestly

Local evidence currently includes the full regression suite, disposable PostgreSQL integration tests, type checking, linting, build, migration checks, and fail-closed database-test preflight. Hosted evidence includes Supabase Auth URL configuration, Vercel Production Secret storage, a successful Production redeploy, and live liveness/readiness/login HTTP checks.

The remaining evidence is external/manual: two-user authorization and collaboration, email-domain and webhook delivery, authenticated SSE/reconnect/outbox drills, backup/restore and alerting, and accessibility/mobile review. The accurate release description is **release candidate — external gates open**, not “fully production-ready.”

## Interview closing answer

If asked what I would do next, I would not add feature breadth. I would run the two-user negative-authorization matrix, measure authenticated SSE behavior, verify email and recovery delivery, perform a disposable restore drill, configure alerts, and record the deployed SHA against the verified source. Those checks turn a strong codebase into an operationally evidenced beta.
