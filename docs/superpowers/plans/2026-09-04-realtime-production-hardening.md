# Saathi Real-Time Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Saathi's existing Redis Streams + SSE collaboration path explicit, fail-visible, workspace-isolated, reconnect-safe, and backed by reproducible tests and operational documentation.

**Architecture:** Keep the Next.js modular monolith and current Redis authority. Server Actions remain the only mutation entry point; Redis Streams remain a bounded workspace-scoped event log; SSE connections read from a Redis cursor and refetch authoritative tasks when replay is no longer possible. No WebSocket migration, consumer groups, CRDT, Kafka, or database rewrite is included.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Upstash Redis, Redis Streams, SSE, Zod, Node test runner, GitHub Actions.

**Spec:** The user-provided Saathi production-grade real-time backend brief pasted into this task.

## Global Constraints

- Preserve existing task, workspace, invitation, authentication, and SSE public behavior unless a failure becomes explicit and recoverable.
- Keep Groq optional and outside authorization, persistence, event ordering, and mutation correctness.
- Do not expose cookies, tokens, API keys, invitation links, or raw personal data in logs or evidence.
- Preserve unrelated dirty worktree changes; do not stage, commit, push, deploy, or mutate production data in this plan without a separate request.
- Use focused tests before broader validation; record deployment and two-user checks separately from local tests.

---

### Task 1: Establish a typed event envelope and fail-visible publishing

**Files:**
- Modify: `lib/realtime.ts`
- Modify: `lib/redis-streams.ts`
- Modify: `lib/types.ts`
- Modify: `app/tasks/actions.ts`
- Modify: `app/actions/workspaces.ts`
- Modify: `app/actions/invitations.ts`
- Test: `lib/realtime-sse.test.ts`
- Create: `lib/realtime-contract.test.ts`

**Interfaces:**
- Consumes: existing `RealtimeEvent` calls from task, workspace, invitation, and load-test actions.
- Produces: a typed event envelope with `streamId`, `type`, `workspaceId`, `actorId`, `timestamp`, and validated `data`; `publishEvent` rejects when the event cannot be appended.

- [ ] Define one `RealtimeEventType` union and one `RealtimeEvent` input type; use `actorId` as the canonical actor field while accepting the current `userId` at the call boundary only if compatibility requires it.
- [ ] Add a boundary parser that rejects missing workspace IDs, invalid event types, malformed timestamps, and non-object payloads before stream publication.
- [ ] Return the Redis stream ID from `publishEvent` and stop swallowing publication failures; callers must receive a failure result or thrown error rather than an unobserved background rejection.
- [ ] Preserve the flat Redis field format and add only the envelope fields needed for identity, authorization scope, event type, actor, timestamp, and payload.
- [ ] Add tests for valid envelopes, invalid envelopes, stream IDs, legacy entries, and publication failures.
- [ ] Run `node --experimental-strip-types --test --test-isolation=none lib/realtime-contract.test.ts lib/realtime-sse.test.ts` and `npx tsc --noEmit --incremental false`.

**Done when:** A task mutation cannot claim realtime publication succeeded when Redis rejected the event, and every delivered event has a stable stream identity and validated workspace scope.

### Task 2: Make SSE reconnect, cleanup, and replay-gap behavior explicit

**Files:**
- Modify: `app/api/realtime/route.ts`
- Modify: `lib/realtime.ts`
- Modify: `lib/realtime-sse.ts`
- Modify: `hooks/useRealtime.ts`
- Modify: `hooks/useSSE.ts`
- Modify: `hooks/use-workspaces.ts`
- Test: `lib/realtime-sse.test.ts`
- Create: `hooks/use-realtime-contract.test.cjs`

**Interfaces:**
- Consumes: `Last-Event-ID`, Redis stream IDs, existing task refresh callback, and browser `EventSource` behavior.
- Produces: clean abort handling, bounded polling, heartbeat messages, duplicate-safe client delivery, and an explicit resync signal when the requested cursor predates retained history.

- [ ] Add a helper that compares a reconnect cursor with the oldest retained stream ID and returns `replayable`, `empty`, or `resync-required` without guessing missing state.
- [ ] Emit `id:` for every persisted event, preserve `Last-Event-ID`, and emit a typed `resync-required` message when retention has removed the requested history.
- [ ] Ensure request abort clears the poll interval, heartbeat interval, reconnect timer, and any in-flight delivery path; do not call `controller.enqueue` or `controller.close` after closure.
- [ ] Keep one poll in flight per connection, cap each batch, and retain the 30-second heartbeat only for presence/connection liveness.
- [ ] Deduplicate event IDs in the client and expose one reconnect/resync callback; `use-workspaces` refetches authoritative tasks on resync or a recovered connection.
- [ ] Remove or clearly isolate the unused WebSocket implementation so it cannot be mistaken for the production transport.
- [ ] Add tests for cursor preservation, replay-gap detection, duplicate IDs, overlapping polls, and cleanup behavior.

**Done when:** A tab that disconnects either replays retained events or explicitly refetches authoritative state; it never silently assumes an incomplete stream is complete.

### Task 3: Harden mutation authorization, distributed limits, and health checks

**Files:**
- Modify: `app/tasks/actions.ts`
- Modify: `app/actions/workspaces.ts`
- Modify: `app/actions/invitations.ts`
- Modify: `app/api/realtime/route.ts`
- Modify: `lib/security.ts`
- Modify: `lib/redis.ts`
- Create: `app/api/health/live/route.ts`
- Create: `app/api/health/ready/route.ts`
- Test: `lib/redis-policy.test.ts`
- Create: `app/api/health/health-contract.test.cjs`

**Interfaces:**
- Consumes: authenticated session cookie, workspace membership policy, Upstash Redis, and existing invitation rate-limit pattern.
- Produces: server-side authorization on every mutation and subscription, Redis-backed task/SSE abuse limits, cheap liveness/readiness endpoints, and stable failure status codes.

- [ ] Validate and normalize every workspace/task/invitation identifier at the Server Action or route boundary before Redis key construction.
- [ ] Ensure task create/update/delete/toggle, workspace edit/delete, member removal, invitation send/accept/decline, usage reads, and SSE subscription all use the authenticated session and explicit membership/ownership policy.
- [ ] Replace the process-local general rate-limit store for production-sensitive boundaries with a small Redis `INCR` + expiry helper; keep local state only as an explicit development fallback.
- [ ] Add targeted limits for task mutations, invitation sends, AI commands, and SSE connection attempts; return 429 with a safe message and no secret details.
- [ ] Add `/api/health/live` as a cheap process check and `/api/health/ready` as a Redis connectivity check with 200/503 responses.
- [ ] Make malformed session records return 401 instead of allowing a JSON parse exception to become a generic 500.
- [ ] Add tests for member/non-member access, rate-limit thresholds, readiness failure, and malformed session handling.

**Done when:** Authorization and abuse protection are enforced at server boundaries, and operators can distinguish a live process from a ready collaboration service.

### Task 4: Add failure exercises, CI, and truthful architecture documentation

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/realtime.md`
- Create: `docs/reliability.md`
- Create: `docs/failure-exercises/redis-unavailable.md`
- Create: `docs/failure-exercises/sse-reconnect.md`
- Create: `docs/failure-exercises/duplicate-event.md`
- Create: `docs/failure-exercises/unauthorized-subscription.md`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: verified event/SSE/auth contracts and repository validation commands.
- Produces: reviewer-readable architecture evidence, reproducible local failure exercises, and PR/main CI for install, type-check, lint, tests, and build.

- [ ] Document the actual mutation-to-event-to-client path, event fields, ordering scope, retention limit, replay guarantee, duplicate guarantee, and the resync behavior after retention expiry.
- [ ] Document Redis responsibilities separately from durable application records and state clearly that the current release still uses Redis as the source of truth.
- [ ] Document Redis outage, disconnect, duplicate delivery, unauthorized subscription, concurrent update, rate-limit, and observability exercises with setup, action, expected result, and cleanup.
- [ ] Add a minimal GitHub Actions workflow using Node setup, `npm ci`, `npm run type-check` with incremental output disabled, `npm run lint`, `npm test`, and `npm run build`.
- [ ] Update README claims to distinguish implemented local guarantees from unrun deployment, two-user, Groq, and benchmark evidence.
- [ ] Run `git diff --check` and inspect the final diff for secrets, unrelated files, unsupported claims, and accidental public contract changes.

**Done when:** A reviewer can clone the project, understand the reliability contract in five minutes, run the failure exercises, and see CI fail on meaningful regressions.

### Task 5: Capture release and benchmark evidence without overclaiming

**Files:**
- Create: `docs/release-evidence/YYYY-MM-DD-saathi-realtime.md`
- Modify: `README.md` only after evidence exists

**Interfaces:**
- Consumes: deployed Vercel URL, configured Upstash Redis, two authenticated test identities, and the existing authenticated load-test script.
- Produces: dated, sanitized evidence for public deployment, two-user collaboration, reconnect/replay, mobile behavior, Redis failure recovery, and p50/p95/p99 benchmark results.

- [ ] Verify public landing/auth/dashboard routes, health endpoints, authentication, persistence after refresh, and mobile layout.
- [ ] Verify two users in one workspace observe task create/update/delete/toggle and member changes without cross-workspace leakage.
- [ ] Force a controlled SSE disconnect and verify replay or authoritative refetch; record whether the retained cursor was replayable.
- [ ] Run the authenticated benchmark with a disposable workspace and record connection count, success/failure count, p50/p95/p99 connection and delivery latency, errors, commit SHA, and environment.
- [ ] Keep unsupported numbers out of README and resume copy; use measured values only.

**Done when:** Production readiness is described as evidence-backed, with deployment and external-provider checks clearly separated from local validation.

## Same-day execution order

1. Task 1: typed event contract and fail-visible publication.
2. Task 2: SSE replay-gap, cleanup, and client resync.
3. Task 3: authorization, distributed limits, and health checks.
4. Task 4: docs, failure exercises, and CI.
5. Task 5: only the release evidence that can actually be run today; do not fabricate external evidence.

The first implementation checkpoint is Task 1. If it exposes partial-write semantics that require an outbox for correctness, document that boundary and keep the change scoped; do not silently claim atomic persistence plus publication without an actual transaction or outbox.
