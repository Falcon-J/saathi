# Saathi Release Readiness Design

**Date:** 2026-09-02

**Status:** Approved direction; implementation and external verification are gated by the checkpoints below.

## Goal

Make Saathi credible for a controlled release and accurate resume evidence by closing the final product, AI, deployment, and performance-validation gaps without changing the Next.js, Redis, or SSE architecture.

## Current evidence

- The local UX slice removes the first-visit onboarding slideshow, adds the permanent `/guide` page, and improves the task editor.
- Local lint, type-check, 58 tests, production build, desktop browser flow, and 390x844 mobile flow pass.
- The live Vercel deployment is behind the local checkout: `/guide` returns 404 and the deployed dashboard still exposes the older AI command bar.
- Overview currently owns quick task creation and complete/reopen. Board owns detailed task editing, deletion, assignment, priority, dates, status movement, search, and import.
- Groq integration uses server-side `GROQ_API_KEY`, optional `GROQ_MODEL`, strict JSON-schema responses, local validation, and an off-by-default public feature flag. No local Groq key is configured.
- The authenticated SSE load test accepts a session cookie and development-only publisher secret, opens up to 250 connections, publishes tagged events, and reports p50/p95/p99 values.

## Product decisions

### Overview remains an execution surface

Overview will not become a second Board. It will expose:

- quick add to Today;
- complete and reopen;
- workspace rename;
- the existing Overview/Board switch as the clear route to detailed controls.

Edit, delete, assignment, priority, due date, status movement, search, and import remain Board responsibilities. This keeps the default visit focused on attention and the next action, while preserving complete task management in one authoritative surface.

### AI remains optional and bounded

The assistant is not an authority. It may interpret a request into exactly one supported workspace mutation, after which existing deterministic Server Actions, authorization, and Redis persistence remain authoritative.

Supported actions are workspace planning, adding one task, completing one task, moving one task between Today and Next, and renaming the current workspace. It will not delete content, manage membership, assign work, or perform multiple mutations from one instruction.

The public guide must describe the actual request context: goal text for planning; workspace ID and name plus compact task IDs, titles, statuses, and Today/Next buckets for commands. Passwords, session cookies, Redis credentials, and member email addresses must not be sent to Groq.

## Release slices

### Slice 1: Overview contract and UX

1. Add a focused contract test documenting the Overview action boundary.
2. Keep Overview mutations limited to quick add and complete/reopen.
3. Make the Board route to detail controls explicit in copy or a compact affordance if the current switch is not discoverable.
4. Verify optimistic updates, error feedback, and authorization remain owned by existing handlers.

### Slice 2: Groq verification

1. Keep `NEXT_PUBLIC_ENABLE_AI_WORKSPACE=false` unless both the flag and server key are deliberately configured.
2. Verify the configured model supports Groq strict JSON-schema output before enabling it. Groq documents strict mode as limited to supported models and recommends JSON Schema for reliable structured output.
3. Run a real-key verification matrix for planning, all supported commands, unsupported requests, malformed responses, non-200 responses, 429 handling, missing-key fallback, and secret exclusion.
4. Capture sanitized evidence only: model ID, date, case name, HTTP result class, validation result, and latency. Never record keys, cookies, prompts containing personal data, or raw provider payloads.
5. Keep the flag disabled until all cases pass and the user explicitly enables the deployment configuration.

### Slice 3: Production validation

After the approved local changes are deployed, validate the live URL in a disposable test workspace:

1. anonymous landing, sign-up, sign-in, logout, and guide access;
2. workspace creation, rename, persistence after reload, and ownership display;
3. task add, edit, complete, reopen, delete, assign, priority, due date, status movement, and error recovery;
4. SSE Live/Offline state, reconnect, and two-user update delivery;
5. desktop and 390x844 mobile layout, including no overflow or clipped dialogs;
6. Vercel deployment identity, environment-variable presence by shape, and deployment logs.

Live account creation and data mutations require explicit action-time approval for the exact disposable data and destination. Existing user data will not be used as a test fixture.

### Slice 4: Benchmark evidence

Use the existing authenticated load test against a controlled local deployment with real Redis credentials and a disposable workspace. The run must provide:

- at least 200 successful authenticated SSE connections;
- tagged events received by every successful connection;
- p50, p95, and p99 connection and event-delivery latency;
- command, date, Redis mode, commit SHA, connection count, duration, event count, and failure count.

The benchmark result supports only the scope it actually measures. A local result may support “200+ concurrent users in local testing,” but it does not prove production capacity or a universal 50ms latency claim.

## Architecture and ownership

- `components/workspace-overview.tsx` owns Overview presentation and its narrow interaction contract.
- `components/task-list.tsx` owns Board detail controls and the task editor.
- `app/actions/workspace-intent.ts` owns the AI boundary; `lib/groq-chat.ts` owns provider transport and response handling; `lib/workspace-intent.ts` owns schemas and validation; existing Server Actions remain mutation authority.
- Redis remains persistence and event authority. SSE remains delivery-only.
- Vercel configuration and live logs remain deployment evidence, not repository-derived assumptions.
- `scripts/load-test.ts` remains the benchmark entry point; the publisher endpoint remains development-only to avoid creating a production mutation backdoor.

## Non-goals

- No new UI framework, AI SDK, Redis provider, or backend rewrite.
- No logo, favicon, Apple icon, or social-image redesign in this release slice.
- No automatic AI enablement.
- No full CRUD duplication in Overview.
- No production mutation endpoint solely for benchmarking.
- No claim of production readiness from local tests alone.
- No inclusion of secrets, real user data, cookies, or raw provider responses in evidence files.

## Acceptance evidence

- Overview and Board have an intentional, documented action boundary.
- Groq is either verified with sanitized real-key evidence and deliberately enabled, or remains visibly disabled with a clear fallback.
- Live deployment passes the listed auth, persistence, CRUD, SSE, collaboration, responsive, and deployment checks.
- Benchmark output contains reproducible percentile evidence with authenticated connections and published tagged events.
- README and resume wording match the measured scope and explicitly exclude unverified production claims.

## Rollback

- Revert the focused Overview, AI-verification, benchmark, or documentation change independently.
- Keep the AI flag false to disable provider calls without a code rollback.
- Do not delete or rewrite Redis data as part of UI, AI, deployment, or benchmark rollback.
