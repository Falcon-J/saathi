# Saathi MAANG Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Saathi a demonstrable, production-minded collaborative workspace with predictable UX, reliable state transitions, and evidence-backed engineering claims.

**Architecture:** Keep the existing Next.js modular monolith, Redis persistence, Redis Streams, SSE, Server Actions, and semantic token system. Improve behavior at the current ownership boundaries instead of introducing a new UI framework, backend rewrite, or speculative abstraction.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind, Radix UI, Lucide, Redis/Upstash, Server-Sent Events, Node test runner, Playwright.

**Spec:** `docs/superpowers/plans/2026-09-01-saathi-full-product-suite.md` plus the approved UI/UX audit decisions from the current task.

## Global Constraints

- Preserve Redis, Redis Streams, SSE, Server Actions, authentication, and existing CRUD contracts.
- Keep AI optional behind `NEXT_PUBLIC_ENABLE_AI_WORKSPACE`; never make Groq authoritative for identity, authorization, or persistence.
- Use semantic Saathi tokens; do not scatter new raw colors or add Atlaskit/another UI framework.
- Use the existing Node test runner and repository validation scripts.
- Stage only files belonging to the current slice; never include `.env*`, screenshots, or unrelated planning artifacts.
- Local tests do not equal production readiness; deployment and two-user evidence must be recorded separately.

## Current Baseline

Commit `55e930b` is pushed to `origin/main`. It contains the first navigation/loading/logout hardening slice. The current baseline has 77 passing tests, passing lint, passing non-incremental type-check, and a passing production build.

---

### Task 1: Establish authenticated browser smoke coverage

**Files:**
- Create: `scripts/browser-smoke.ts`
- Modify: `package.json`
- Test evidence: `output/playwright/` kept outside commits

**Interfaces:**
- Consumes: a configured test account and deployed/local `BASE_URL`.
- Produces: repeatable checks for login, workspace load, logout, and mobile layout.

- [ ] Define a test-only account contract using environment variable names without committing credentials.
- [ ] Write failing smoke assertions for login redirect, dashboard loading completion, visible navigation, and logout redirect.
- [ ] Run the smoke command against a local build and confirm it fails for any missing prerequisite rather than silently passing.
- [ ] Implement only the browser harness and package script; do not change product behavior in this task.
- [ ] Run desktop and 390px mobile smoke checks and save sanitized evidence.
- [ ] Commit as `test: add authenticated browser smoke coverage`.

**Done when:** The core authenticated journey can be replayed locally and against a configured deployment without exposing credentials or relying on screenshots alone.

### Task 2: Make authentication recovery production-grade

**Files:**
- Modify: `components/auth-form.tsx`
- Modify: `components/auth-form.test.cjs`
- Modify: `app/(auth)/login/page.tsx`
- Create only if the existing auth boundary supports it: `app/(auth)/reset-password/page.tsx`, `app/actions/auth-recovery.ts`

**Interfaces:**
- Consumes: existing login/signup result contracts.
- Produces: clear field-level validation, password visibility control, recoverable loading/error states, and an explicit recovery path if supported by the current persistence model.

- [ ] Write failing tests for show/hide password accessibility, submit retry after failure, and no duplicate submit.
- [ ] Run the focused auth tests and confirm the new assertions fail.
- [ ] Add password visibility controls with labels, preserve browser autocomplete, and keep errors inline.
- [ ] Add a recovery link only when a safe server-side recovery contract exists; do not invent token storage or email delivery in the UI.
- [ ] Run auth tests, lint, and type-check.
- [ ] Commit as `feat: improve authentication recovery UX`.

**Done when:** A user can understand, retry, and recover from auth errors without duplicate toasts or a dead form.

### Task 3: Simplify Board cards and align Overview ownership

**Files:**
- Modify: `components/task-list.tsx`
- Modify: `components/workspace-overview.tsx`
- Modify: `lib/overview-capabilities.ts`
- Modify: `lib/product-guide.ts`
- Modify: `components/task-list` and overview focused tests

**Interfaces:**
- Consumes: existing `TaskUpdate`, task mutation callbacks, and overview capability contract.
- Produces: Board as the detailed editing surface; Overview as a focused triage surface.

- [ ] Write failing tests that assert Overview supports quick add, complete, and reopen while Board owns edit, delete, assignment, priority, due date, status, filters, and import.
- [ ] Run focused tests and confirm the capability mismatch fails.
- [ ] Remove secondary edit/delete/select controls from Overview cards and keep the primary next-action affordance prominent.
- [ ] Reduce Board card metadata to title, status, priority, due date/time, assignee, and one overflow/edit action; keep full editing in the modal.
- [ ] Add explicit empty, filtered-empty, loading, and mutation-error copy for both surfaces.
- [ ] Run task, overview, guide, lint, type-check, and build validation.
- [ ] Commit as `refactor: clarify overview and board responsibilities`.

**Done when:** Users can predict where every task action lives and task cards remain readable at desktop and mobile widths.

### Task 4: Complete Team, invitation, import, and realtime states

**Files:**
- Modify: `components/member-manager.tsx`
- Modify: `components/invitation-notifications.tsx`
- Modify: `components/task-import.tsx`
- Modify: `lib/csv.ts`
- Modify: `hooks/useSSE.ts`
- Modify: `app/dashboard/page.tsx`
- Add focused tests beside each existing module.

**Interfaces:**
- Consumes: existing member, invitation, CSV, and SSE contracts.
- Produces: visible pending/processing/error/retry states with no silent mutation failure.

- [ ] Write failing tests for invite processing failure, CSV row-level validation, SSE offline/reconnect messaging, and stale navigation state.
- [ ] Run focused tests and verify the failures reproduce the missing states.
- [ ] Keep inline errors beside the control that failed; use toasts only for completed actions.
- [ ] Add CSV preview and row-level rejection summary without changing the persisted task schema.
- [ ] Add realtime last-synced/stale copy and preserve the existing reconnect action.
- [ ] Run the full suite, lint, type-check, and build.
- [ ] Commit as `feat: harden collaboration recovery states`.

**Done when:** Team and import mutations are understandable during success, failure, retry, and partial-input cases; realtime degradation is explicit.

### Task 5: Verify optional Groq behavior and document boundaries

**Files:**
- Modify: `lib/feature-flags.ts`
- Modify: `lib/groq-chat.ts`
- Modify: `scripts/verify-groq.ts`
- Modify: `README.md`
- Add/update: `lib/groq-verification.test.ts`

**Interfaces:**
- Consumes: `GROQ_API_KEY`, `NEXT_PUBLIC_ENABLE_AI_WORKSPACE`, existing structured command schemas.
- Produces: repeatable enabled/disabled, malformed-output, rate-limit, and fallback evidence.

- [ ] Write failing verification cases for disabled mode, missing key, valid generation, malformed output, refusal, and rate limit.
- [ ] Run verification without a key and confirm the feature fails closed.
- [ ] Run the real provider verification only with a locally supplied key; never print or persist it.
- [ ] Confirm deterministic authorization and persistence remain outside Groq.
- [ ] Update README with configuration, supported commands, limitations, and safe rollout/rollback steps.
- [ ] Commit as `docs: document optional Groq workspace assistant`.

**Done when:** AI can be enabled deliberately, tested independently, disabled safely, and accurately described in the product and resume.

### Task 6: Run release validation and capture resume evidence

**Files:**
- Modify: `README.md`
- Create: `docs/release-evidence/YYYY-MM-DD-saathi-release.md`
- Validate: deployed Vercel environment, Redis, SSE, and browser flows

**Interfaces:**
- Consumes: pushed commit SHA, Vercel environment configuration, two test identities, and authenticated benchmark credentials.
- Produces: dated evidence for release gates and truthful resume wording.

- [ ] Verify public landing, auth entry, dashboard redirect, favicon/metadata, and mobile layout on the deployed URL.
- [ ] Verify two-user workspace membership, task mutation visibility, SSE reconnect, and offline recovery.
- [ ] Run the authenticated 200-connection benchmark only with a real workspace ID and load-test secret.
- [ ] Record measured latency, concurrency, failures, environment, commit SHA, and unverified limits without exposing credentials or user data.
- [ ] Update README and resume claims to measured values only; remove unsupported “50ms” or “200+ users” claims.
- [ ] Commit the sanitized evidence separately as `docs: add Saathi release evidence`.

**Done when:** Release status is evidence-backed, rollback ownership is clear, and every resume claim can be demonstrated from a dated artifact.

### Task 7: Harden the invitation domain and acceptance state machine

**Files:**
- Modify: `app/actions/invitations.ts`
- Modify: `app/actions/workspaces.ts`
- Modify: `lib/security.ts`
- Modify: `lib/redis.ts`
- Create: `lib/invitation-domain.ts`
- Create: `lib/invitation-domain.test.ts`
- Create: `app/actions/invitations.test.ts`

**Interfaces:**
- Consumes: authenticated session, canonical workspace membership, existing Redis client, and existing invitation action contracts.
- Produces: cryptographically generated invitation IDs, Redis TTLs, deterministic pending uniqueness, runtime input validation, guarded status transitions, distributed invitation limits, and idempotent acceptance behavior.

- [ ] Define the invitation state machine and allowed transitions: `pending -> accepted|declined|revoked|expired`, with no terminal-state overwrite.
- [ ] Add runtime validation for `workspaceId`, `invitationId`, email input, and persisted invitation records at the Server Action boundary.
- [ ] Replace `Date.now()`/`Math.random()` invitation IDs with `crypto.randomUUID()` or secure random bytes; never use the ID as an email bearer token.
- [ ] Store invitation records with a seven-day Redis TTL and add a workspace-scoped pending uniqueness key using an atomic `SET NX EX` operation.
- [ ] Replace read-modify-write pending-index cleanup with atomic set removal and preserve unrelated concurrent invitations.
- [ ] Add an atomic accept operation that makes membership, invitation status, and indexes converge; repeated accepts must return an already-accepted result without duplicating membership.
- [ ] Enforce invitation limits in Redis, keyed by owner, workspace, recipient, and request source; keep the configured limits out of process-local memory.
- [ ] Add tests for duplicate concurrent sends, concurrent acceptance, expiry, replay, wrong recipient, terminal-state transitions, partial failure recovery, and rate-limit enforcement.
- [ ] Run focused invitation tests, the existing suite, lint, type-check, and production build.
- [ ] Commit as `fix: make invitation state transitions atomic`.

**Done when:** The existing in-app invitation flow is deterministic, race-safe, bounded, and test-covered before any external email provider is introduced.

### Task 8: Add verified email delivery with an outbox

**Files:**
- Create: `lib/email/provider.ts`
- Create: `lib/email/resend-provider.ts` or `lib/email/postmark-provider.ts`
- Create: `lib/invitation-delivery.ts`
- Modify: `app/actions/invitations.ts`
- Modify: `lib/env.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Create: `app/api/webhooks/email/route.ts`
- Create: `lib/invitation-delivery.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the hardened invitation record and outbox entry from Task 7, a server-only provider API key, and a verified sender domain.
- Produces: idempotent email delivery, provider message tracking, bounce/complaint processing, safe retries, and an in-app fallback when delivery is delayed or fails.

- [ ] Choose one provider based on verified sender-domain support, idempotency, delivery events, free-tier limits, and operational fit; do not support SMTP and an API provider simultaneously in this slice.
- [ ] Add server-only environment variables for provider selection, API key, sender address, application URL, and webhook verification secret; never expose the API key to browser code.
- [ ] Add an outbox record created with the invitation, using a stable delivery idempotency key derived from the invitation ID and send attempt.
- [ ] Implement provider calls with bounded retry behavior for transient failures and no automatic retry for permanent recipient failures.
- [ ] Send an opaque, single-use, time-limited invitation token; persist only its hash and never log the raw token or complete invitation URL.
- [ ] Add a webhook route that authenticates provider callbacks, deduplicates event IDs, updates delivery state, and suppresses hard-bounced addresses.
- [ ] Keep the invitation visible in Saathi regardless of email delivery status.
- [ ] Add provider contract tests for success, duplicate send, 429, 5xx, malformed response, invalid webhook, duplicate webhook, bounce, and complaint events.
- [ ] Update README with setup, sender-domain verification, local testing, rollback, and disabled-email behavior.
- [ ] Commit as `feat: deliver verified workspace invitations`.

**Done when:** A staging owner can invite a real test address, receive one usable email, accept it once, and observe delivery or failure state without relying on a background promise.

### Task 9: Complete invitation UX and two-user acceptance flows

**Files:**
- Modify: `components/member-manager.tsx`
- Modify: `components/invitation-notifications.tsx`
- Create: `app/invitations/[token]/page.tsx`
- Create: `app/invitations/[token]/loading.tsx`
- Create: `app/invitations/[token]/error.tsx`
- Modify: `hooks/use-workspaces.ts`
- Create: `components/invitation-status.test.tsx`
- Create: `e2e/invitation-flow.spec.ts`

**Interfaces:**
- Consumes: invitation status and token contracts from Tasks 7–8, existing auth session flow, and existing workspace membership refresh/realtime behavior.
- Produces: clear outgoing and incoming invitation states, accept-link recovery through login/signup, resend/revoke controls, and accessible failure states.

- [ ] Replace “Invitation sent” with delivery-aware copy such as “Invitation queued” or “Invitation delivered,” depending on authoritative provider state.
- [ ] Show pending, delivered, bounced, expired, revoked, and accepted states in the owner’s team panel.
- [ ] Add resend with cooldown and revoke/cancel with confirmation; preserve idempotency and authorization on the server.
- [ ] Add a dedicated token landing page with workspace name, inviter, recipient hint, expiration, and explicit accept action.
- [ ] Preserve the opaque token through authentication without placing sensitive invitation data in client state or logs.
- [ ] Add loading, invalid-token, expired, revoked, already-used, offline, and retry UI states.
- [ ] Run desktop and mobile two-user browser tests covering existing and new accounts, accept, decline, revoke, expiry, and delivery failure fallback.
- [ ] Commit as `feat: complete workspace invitation recovery flows`.

**Done when:** An invited person can understand, recover, and complete the flow from email to workspace membership on desktop and mobile.

### Task 10: Release-gate invitation service and update claims

**Files:**
- Create: `docs/release-evidence/YYYY-MM-DD-invitation-service.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-04-saathi-maang-readiness-plan.md`

**Interfaces:**
- Consumes: deployed Vercel environment, verified email provider, two test identities, Redis metrics/logs, and the invitation test suite.
- Produces: dated evidence for delivery, replay resistance, concurrency, abuse controls, recovery, and rollback.

- [ ] Verify Vercel production and preview variables using names and presence only; do not print secret values.
- [ ] Send a staging invitation to a controlled test address and record provider message ID, sanitized delivery state, and timestamps.
- [ ] Verify token replay, wrong-recipient access, expired-token access, concurrent acceptance, duplicate resend, revoke, bounce, and webhook deduplication.
- [ ] Verify Redis persistence and index convergence after injected delivery and mutation failures.
- [ ] Run the authenticated collaboration benchmark separately from invitation delivery and record measured values only.
- [ ] Update the resume to claim “email invitations with verified, single-use links and delivery recovery” only if the evidence exists.
- [ ] Commit sanitized evidence as `docs: add invitation release evidence`.

**Done when:** The invitation service has deployed two-user evidence and its resume claims are backed by dated test results.

---

## Codex Execution Timeline

This is a practical eight-to-ten working-day plan for one maintainer using Codex in short, reviewable sessions. Each day ends with a checkpoint; a task is not considered complete until its checkpoint evidence is recorded.

| Day | Codex session | Deliverable | Checkpoint |
|---|---|---|---|
| 1 | Audit + domain model | Confirm current invitation contract, actors, keys, states, and threat model | Written decision: real email versus in-app-only; this roadmap assumes real email |
| 2 | Task 7, slice A | Validation, secure IDs, TTLs, deterministic uniqueness | Focused tests for invalid input, expiry, and duplicate sends |
| 3 | Task 7, slice B | Atomic acceptance, guarded decline/revoke semantics, distributed limits | Concurrent acceptance and partial-failure tests pass |
| 4 | Task 8, slice A | Provider selection, server-only config, outbox and opaque token | Provider contract tests pass with a fake client |
| 5 | Task 8, slice B | Real provider send, retries, idempotency, webhook verification | One staging email delivered; no secret/token leakage |
| 6 | Task 9 | Invitation landing page, resend/revoke, delivery-aware UI | Desktop/mobile two-user flow passes locally |
| 7 | Task 9 hardening | Expired/revoked/offline/retry UX and accessibility | Failure-path browser checks pass |
| 8 | Task 10 | Vercel/Redis/provider release validation | Dated evidence artifact completed; rollback tested |
| 9–10 | Buffer | Fix only evidence-backed failures; rerun release gates | No open P0/P1 invitation findings |

### Codex operating rhythm

- Start each session with `git status --short`, the applicable `AGENTS.md`, and the current plan checkpoint.
- Give Codex one slice only: inspect, write failing tests, implement, validate, review diff.
- Keep source changes separate from evidence and screenshots.
- Ask Codex to stop at the checkpoint rather than combining multiple unverified tasks.
- Use a fresh review pass after each task; do not rely on a green unit suite for provider or deployed behavior.
- Never paste API keys, cookies, invitation tokens, full email URLs, or raw production logs into the task.

### Updated execution order

1. Task 7: invitation state-machine hardening.
2. Task 3: Board/Overview clarity.
3. Task 4: collaboration and recovery states.
4. Task 2: authentication recovery.
5. Task 8: verified invitation delivery.
6. Task 9: invitation UX and two-user flows.
7. Task 5: optional Groq verification.
8. Task 1: authenticated browser smoke foundation if not already completed.
9. Task 6 and Task 10: production evidence and truthful resume wording.

The invitation service should be treated as a release blocker for any claim that Saathi supports email-based collaboration. Until Tasks 7–10 pass, describe the current feature as an in-app invitation inbox, not email delivery.

## Recommended Execution Order

1. Task 7: invitation state-machine hardening.
2. Task 3: Board/Overview clarity, because it is the main product surface.
3. Task 4: collaboration and recovery states.
4. Task 2: authentication recovery.
5. Task 8: verified invitation delivery.
6. Task 9: invitation UX and two-user flows.
7. Task 5: optional Groq verification.
8. Task 1: authenticated browser smoke foundation if not already completed.
9. Task 6 and Task 10: production evidence and truthful resume wording.

The next coding slice should be Task 7. Email invitation is a collaboration trust boundary, so its state model must be hardened before adding external delivery or making production claims about email collaboration.
