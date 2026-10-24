# Saathi Production Readiness Closeout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Saathi from a locally verified v1 release candidate to an externally evidenced beta that is safe to operate and easy to explain in interviews.

**Architecture:** Keep the existing Next.js modular monolith. Supabase Auth owns identity and sessions; PostgreSQL owns durable workspace state, activity, and outbox records; Server Actions own authorization and transactional mutations; Upstash Redis and SSE provide delivery-only realtime coordination; AI remains optional, server-side, bounded, and reviewable.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Drizzle ORM, PostgreSQL/Supabase, Upstash Redis Streams, SSE, Resend, optional Groq, Vercel, Node test runner, Docker Compose.

**Spec:** `docs/product/saathi-v1-product-requirements.md`, `docs/architecture/saathi-v1-project-map.md`, and `docs/release/2026-09-15-manual-fr-nfr-validation.md`.

## Global Constraints

- PostgreSQL remains the authoritative source for durable domain state.
- Every workspace read, mutation, comment, realtime subscription, and AI request verifies current membership server-side.
- Redis/SSE never becomes the source of truth; clients reconcile from PostgreSQL after reconnects, missed events, or conflicts.
- AI may interpret and draft, but deterministic application code owns authorization, persistence, delivery, and mutation success.
- Do not use production data or credentials for validation.
- Never print or commit secrets, cookies, provider payloads, database URLs, or whole environment files.
- Do not stage, commit, push, deploy, or change hosted configuration without explicit approval.
- Do not expand v1 with autonomous AI writes, conversation history, organizations, subtasks, labels, attachments, or billing.

## Review Focus

1. Missing database configuration must fail the integration command instead of silently skipping tests — covered by `scripts/database-preflight.test.cjs` and `scripts/require-database-test.mjs`.
2. Preview and production must not point at the wrong database, Redis, email, or secrets — verify deployment configuration without revealing values.
3. A non-member must never read, subscribe, mutate, comment on, or ask AI about another workspace — execute negative-path checks with two real disposable accounts.
4. Realtime delivery failure must preserve committed PostgreSQL state and leave retryable outbox work — exercise disconnect, reconnect, missed events, and outbox failure.
5. AI must not claim or perform an unreviewed mutation — verify provider output, explicit draft confirmation, normal task validation, and no raw content retention.

## Release sequence

### Task 1: Freeze and verify the release candidate

**Files:**
- Review: `package.json`
- Review: `scripts/require-database-test.mjs`
- Review: `scripts/database-preflight.test.cjs`
- Record: `docs/release/2026-09-21-release-evidence.md`

**Interfaces:**
- Consumes: the current `origin/main` release tree and the local disposable PostgreSQL service.
- Produces: a reproducible local verification record and a reviewed, authorized change set.

- [ ] Confirm the active checkout is `C:\Users\1552441\Documents\ChatGPT\saathi.git\implementation` and record `git rev-parse HEAD`, `git rev-parse origin/main`, and `git status --short --branch`.
- [ ] Review the three uncommitted database-preflight files; confirm they contain no secrets or unrelated changes.
- [ ] Start PostgreSQL with `npm run local:postgres:up`.
- [ ] Set only process-scoped loopback values:

```powershell
$env:DATABASE_TEST_URL="postgresql://postgres:postgres@localhost:55439/postgres"
$env:DATABASE_MIGRATION_URL=$env:DATABASE_TEST_URL
```

- [ ] Run `node scripts/bootstrap-test-database.mjs` and `npm run db:migrate`.
- [ ] Run `npm run test:database`, `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, `npm run db:check`, and `git diff --check`.
- [ ] Record exact counts and skips in `docs/release/2026-09-21-release-evidence.md`; do not call local evidence hosted production proof.

### Task 2: Provision one clean hosted beta topology

**Files:**
- Review: `.env.example`
- Review: `scripts/validate-env.js`
- Record: `docs/release/2026-09-21-release-evidence.md`

**Interfaces:**
- Consumes: a user-controlled Vercel project, Supabase project, Upstash Redis database, and disposable email/provider configuration.
- Produces: one intentional beta path: Git commit → Vercel deployment → Supabase Auth/PostgreSQL → Upstash Redis → email provider.

- [ ] Choose one Vercel project; archive or disconnect the obsolete duplicate integration instead of maintaining two ambiguous deployment paths.
- [ ] Create or select a disposable Supabase project for beta validation; do not use production data.
- [ ] Apply the committed migrations through the server-only migration connection.
- [ ] Configure production/preview values without printing them: `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and a 32+ character `CRON_SECRET`.
- [ ] Keep `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, and `GROQ_API_KEY` server-only.
- [ ] Run `npm run validate-env` in the deployment environment and retain only pass/fail evidence.
- [ ] Record the exact Git SHA, Vercel deployment ID, environment name, and rollback deployment before running user tests.

### Task 3: Validate identity, workspace, and authorization boundaries

**Files:**
- Execute against: `app/(auth)/`, `app/dashboard/`, `app/actions/`, `lib/auth-simple.ts`, `lib/data/`
- Record: `docs/release/2026-09-21-release-evidence.md`

- [ ] Create two disposable accounts and confirm both through the configured Auth flow.
- [ ] Test register, login, refresh, logout, login again, password recovery, invalid credentials, and invalid/expired recovery links.
- [ ] As owner, create a workspace and confirm the owner membership is created atomically.
- [ ] As a non-member, verify workspace reads, task reads, comments, realtime subscriptions, and AI requests return forbidden/no-data results.
- [ ] Verify archived workspaces leave the active selection and reject new mutations.
- [ ] Verify owner-only settings, membership removal, unassignment, ownership transfer, and deletion behavior using disposable data.
- [ ] Record each case as `PASS`, `FAIL`, or `BLOCKED` with actor, expected result, observed result, and evidence.

### Task 4: Validate the complete two-user collaboration loop

**Files:**
- Execute against: `components/task-list.tsx`, `components/task-comments.tsx`, `components/activity-history.tsx`, `lib/data/tasks.ts`, `lib/data/comments.ts`, `lib/data/invitations.ts`
- Record: `docs/release/2026-09-21-release-evidence.md`

- [ ] Owner invites member using a normalized email address.
- [ ] Member accepts the invitation; repeat acceptance and confirm one membership and one acceptance activity event.
- [ ] Owner creates and assigns a task; member completes and reopens it.
- [ ] Verify assignee permissions: completion/reopen allowed; edit/delete/assignment changes rejected.
- [ ] Add a comment as member; verify the owner can read it and the activity event is durable.
- [ ] Perform concurrent task/workspace edits and confirm the stale version receives a conflict rather than overwriting newer data.
- [ ] Test date-only deadlines, precise deadlines, workspace timezone rendering, Today, Next, overdue, and completed grouping.
- [ ] Test empty, loading, permission, conflict, offline/recovery, archived, keyboard, and 390px mobile states.

### Task 5: Validate realtime, outbox, and performance evidence

**Files:**
- Execute against: `app/api/realtime/route.ts`, `app/api/realtime/load-test/route.ts`, `scripts/load-test.ts`, `lib/realtime-sse.ts`, `lib/data/events.ts`, `app/api/internal/outbox/route.ts`
- Record: `docs/benchmarks/2026-09-21-authenticated-sse.md` and `docs/release/2026-09-21-release-evidence.md`

- [ ] Use a disposable hosted Upstash Redis instance and a disposable authenticated workspace/session.
- [ ] Set process-scoped `LOAD_TEST_COOKIE`, `LOAD_TEST_SECRET`, and `LOAD_TEST_WORKSPACE_ID`; never commit or print their values.
- [ ] Run the documented benchmark:

```powershell
$env:LOAD_TEST_COOKIE="auth-session=..."
$env:LOAD_TEST_SECRET="..."
$env:LOAD_TEST_WORKSPACE_ID="..."
npm run load-test -- --connections 250 --duration 30 --events 3 --url https://<beta-origin>
```

- [ ] Accept results only when at least 200 authenticated connections succeed, no connection fails, and every generated event reaches every connected client.
- [ ] Disconnect a browser, mutate from the other browser, reconnect, and verify PostgreSQL reconciliation after missed events.
- [ ] Force a realtime publication failure and confirm the durable mutation remains committed while its outbox row remains retryable.
- [ ] Call the authenticated internal outbox route with `Authorization: Bearer <CRON_SECRET>` and verify delivered, deferred, failed, and retention-cleanup outcomes without exposing payloads.

### Task 6: Close email and optional AI provider gates

**Files:**
- Execute against: `lib/email-delivery.ts`, `lib/email-webhook.ts`, `app/api/webhooks/email/route.ts`, `scripts/verify-groq.ts`, `lib/ai/`
- Record: `docs/release/2026-09-21-release-evidence.md`

- [ ] Verify a user-controlled Resend sending domain through DNS.
- [ ] Configure `EMAIL_FROM` and `RESEND_WEBHOOK_SECRET`; send one controlled invitation to a disposable inbox.
- [ ] Verify delivered, bounced, complained, retryable, and terminal outcomes are reflected without raw provider data in logs.
- [ ] Configure hosted Supabase custom SMTP and verify confirmation and recovery templates using disposable accounts.
- [ ] Keep AI disabled unless explicitly needed for validation; if enabled, run `npm run verify:groq` with a controlled key and record sanitized outcome/latency only.
- [ ] Run summary, attention, question, provider-timeout, invalid-output, rate-limit, and reviewed-draft cases.
- [ ] Confirm no AI response can authorize access, mutate automatically, or claim persistence before the deterministic command commits.

### Task 7: Prove operational recovery and rollback

**Files:**
- Record: `docs/release/2026-09-21-operational-readiness.md`
- Review: Vercel, Supabase, Upstash, email-provider settings and logs

- [ ] Confirm database backup schedule, retention, restore procedure, and owner.
- [ ] Perform a restore drill against disposable data and record duration, result, and data-integrity checks.
- [ ] Configure alerts for readiness failure, database failure, Redis failure, outbox backlog, email terminal failures, and elevated runtime errors.
- [ ] Exercise a failed deployment rollback to the last known-good Vercel deployment.
- [ ] Verify production and preview use separate data, Redis, email, and secrets.
- [ ] Confirm logs contain no passwords, tokens, cookies, raw AI prompts/responses, or unnecessary personal data.

### Task 8: Final release decision and interview package

**Files:**
- Record: `docs/release/2026-09-21-release-evidence.md`
- Record: `docs/release/2026-09-21-operational-readiness.md`
- Create: `docs/interviews/saathi-v1-interview-brief.md`

- [ ] Confirm all functional and security cases are `PASS` or have an explicit external owner and deadline.
- [ ] Confirm deployed SHA matches the verified source SHA.
- [ ] Confirm the rollback deployment and operational contacts are recorded.
- [ ] Mark the project `production-ready beta` only after hosted evidence exists; otherwise mark it `release candidate — external gates open`.
- [ ] Write the interview brief with: 30-second product pitch, architecture diagram, authority boundaries, authorization model, optimistic-concurrency explanation, realtime failure model, AI safety boundary, key tradeoffs, measured evidence, and honest remaining limitations.
- [ ] Before any commit, push, PR, deployment, or hosted configuration change, obtain explicit authorization and inspect the resulting diff/configuration.

## Done When

- Local tests cannot silently skip integration coverage and all local validation passes.
- A disposable hosted beta completes the two-user and negative-authorization matrix.
- Realtime, outbox, email, readiness, rollback, backup/restore, and retention evidence is recorded.
- The deployed SHA is confirmed against the verified source SHA.
- AI remains optional and bounded; no autonomous mutation path exists.
- The release record distinguishes implemented, locally verified, hosted verified, blocked, and intentionally deferred capabilities.
- The interview brief lets the maintainer explain the system from product outcome through ownership boundary, contract, data shape, failure mode, and evidence.

## Non-goals

- Do not add feature breadth before closing these gates.
- Do not enable real email or AI merely to make a checklist look complete.
- Do not claim performance, production reliability, or hosted correctness from unit tests or public HTTP 200 responses alone.
