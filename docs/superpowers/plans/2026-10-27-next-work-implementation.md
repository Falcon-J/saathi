# Next work implementation plan

> **For agentic workers:** Use the applicable execution workflow for independently reviewable tasks. This is a plan, not authorization to commit, push, deploy or mutate hosted data.

**Goal:** Provide an explainable, deterministic workspace view of work ready or waiting on explicitly recorded task prerequisites.

**Architecture:** Extend the existing modular monolith and PostgreSQL authority. Use workspace-locked transactional dependency commands, the existing consistent-read pattern, task permissions, task versions and transactional activity/outbox; calculate readiness from a complete authorized graph. Reuse the existing Overview and task dialog, with no AI dependency or canvas requirement.

**Tech stack:** Next.js/React/TypeScript, existing Postgres/Drizzle migrations and postgres.js transaction patterns, existing test and UI components.

**Spec:** `docs/product/2026-10-27-next-work-frs.md` (draft). The user-facing choices in section 10 must be resolved before implementing those behaviors.

## Global constraints

- Preserve uncommitted/untracked files, current data, server-side authorization, role rules, workspace archive semantics, optimistic task versions, idempotent recovery, activity/outbox and SSE reconciliation.
- No reset, destructive cleanup, commit, push, production migration or deploy without explicit authorization.
- No invented blockers, prerequisite links, owners or deadlines; no AI provider call in the readiness path.
- No full canvas, notes, MCP, auto-complete or new persisted task status in this slice.
- Existing production migration history uses a different mechanism from preview; inspect/reconcile the selected environment before any later migration.

## Review focus

1. Incomplete graph or a prerequisite outside the page never produces false ready (Tasks 1, 3).
2. Competing A→B and B→A inserts never both commit (Task 2).
3. Deleting a prerequisite, deleting the workspace, or losing membership never silently exposes/changes readiness (Tasks 2, 3).
4. Reopening an upstream task or a stale dependency edit updates evidence without changing downstream status or losing a draft (Tasks 1, 2, 4).
5. Repeated or unknown command outcomes do not duplicate edge/activity and do not bypass current authorization (Task 2).

## File ownership map (candidates; verify before editing)

- `lib/next-work.ts`, `lib/next-work.test.ts`: pure graph projection and reason/order rules.
- `lib/db/schema.ts`, `drizzle/` SQL and migration metadata, database migration tests: edge integrity, receipts, indexes and reversible rollout checks. Determine next migration number from the live checkout; do not assume it.
- `lib/data/task-dependencies.ts`, `lib/data/task-dependencies.test.ts`: authorized transactional commands/read of full task graph, with dependency event + receipt handling.
- `app/actions/task-dependencies.ts`, corresponding action tests: server session boundary and safe result mapping.
- `components/workspace-overview.tsx`, `components/workspace-overview-behavior.test.cjs`, task detail editor and its tests: read states, evidence, open task, permitted add/remove and recovery.
- `hooks/workspace-sync` and existing realtime event contracts/tests: reconcile on relevant events. Trace existing consumers first; extend the existing pattern rather than introduce a parallel channel.
- `CONTEXT.md` / product docs: record only approved canonical vocabulary and behavior after decisions. Keep this draft labelled as a proposal until then.

## Task 1: Define and prove the deterministic projection

**Produces:** `deriveNextWork(tasks, dependencies, timezone, now)` with `ready`, `waiting`, and `completedInconsistencies` and source prerequisite details; types must represent complete input, not conflate missing edges with no edges.

- [ ] Write failing pure tests for the five-task chain; no prerequisites; diamond with two prerequisites; incomplete prerequisite; completed dependent with unmet prerequisite; reopen; undated and deterministic tie ordering; mixed date-only/timed deadlines and DST; duplicate/missing endpoint rejection.
- [ ] Run the focused test and confirm it fails for the intended missing behavior.
- [ ] Implement the small pure projection using canonical task status and complete same-workspace graph; never calculate from visible page or AI.
- [ ] Run `node --experimental-strip-types --test lib/next-work.test.ts` and relevant existing task-time tests. Verify expected output, then inspect the diff.

## Task 2: Transactional dependency commands and lifecycle

**Consumes:** FR-NW-05–07 and the approved deletion/permission decisions. **Produces:** authenticated add/remove operations using dependent expected version and command ID; durable edge, dependent version, event and receipt commit together.

- [ ] Load the Postgres best-practices skill before designing or changing database schema. Inspect migrations and existing receipt/lock patterns. Design candidate key/FKs, uniqueness, self-check, RLS/grants, indexes, cascade/whole-workspace deletion and rollout/rollback; do not execute a hosted migration.
- [ ] Add failing real-database tests for same-workspace endpoints, self/duplicate edges, unauthorized/archived actors, stale versions, deletion/whole-workspace deletion, membership removal, same-ID replay after an intervening edit, conflicting payload, unknown result recovery and atomic event/receipt. Ensure receipt replay triggers authoritative refresh and cannot overwrite newer client state.
- [ ] Add a test with **two independent database connections/transactions** attempting opposite edges concurrently; a single-connection pool is not concurrency evidence. Assert at most one commits and the final graph is acyclic.
- [ ] Implement the smallest migration and commands under the existing workspace lock and lock order. Check the full graph for cycles while serialized. Reauthorize before receipt replay. No client-provided identity is authoritative.
- [ ] Run focused database tests against an explicitly configured disposable database, schema checks and existing permission/mutation regressions. Record skipped tests and environment limitations.

## Task 3: Authoritative graph read and action

**Consumes:** Task 1 projection and Task 2 edge store. **Produces:** one authenticated read result with `asOf`, complete authorized task/edge data, ready/waiting/inconsistency rows, and explicit error outcome.

- [ ] Add failing tests for consistent authorized task+edge reads, endpoints outside the visible page, revoked/outsider/archived reads, incomplete graph errors and no data leakage. Distinguish a read authorized before revocation from subsequent requests; clear client state once revocation or denial is observed.
- [ ] Implement a repeatable-read, read-only transaction following `lib/data/tasks.ts`; do not treat the task page or a failed edge query as a complete graph. Set and document a supported graph bound only after measuring current repository limits; fail explicitly if complete evaluation cannot be guaranteed.
- [ ] Add the server action using the existing session and error boundary. Run focused graph/action/authorization tests.

## Task 4: Explainable UI and synchronization

**Consumes:** Task 3 results and Task 2 commands. **Produces:** ready/waiting sections, reason-to-task navigation and explicit prerequisite editing with loading/empty/error, stale and conflict recovery.

- [ ] Write focused behavior tests for task navigation, owner/creator edit, assignee read/toggle rights, disabled/revoked access, pending/empty/error, stale retained input, AI-off, priority-independent ready state and keyboard behavior.
- [ ] Extend existing Overview/task editor with house controls. Keep all tasks discoverable and do not change persisted task state automatically. Handle uncertain commands using the same command ID.
- [ ] Trace and test existing event consumers for task updates, dependency updates, membership revocation and reconnect. Re-read authoritative state; do not treat SSE payloads as truth. Protect against out-of-order refreshes and stale workspace responses.
- [ ] Run focused component tests, `npm run type-check`, scoped lint and relevant existing task/navigation/realtime regressions. Browser-check owner/member, desktop and 360 px, keyboard/focus, provider-off and errors using disposable fixtures.

## Task 5: Validation, performance and release decision

- [ ] Run `npm test`, relevant database suite, build and browser checks as supported; capture revision, environment, skips and errors. Never call a skipped integration check passed.
- [ ] Verify concurrency, graph size/query plan, acceptable latency and no N+1 reads against the agreed bounded workload; retain existing failed sustained test as a separate gate. Do not claim capacity from a tiny fixture.
- [ ] Run the five-task comparative study from `docs/product/2026-10-27-next-work-comparison.md` with authorized disposable competitor workspaces. Capture task steps/time, configuration, success, false-ready/false-waiting and user feedback. Until access exists, mark hands-on comparison blocked.
- [ ] Review schema compatibility, migration history, rollback, monitoring and current deploy SHA. Present an explicit release decision and obtain authorization before any hosted mutation or deploy. Hosted AI diagnosis remains a separate issue.

## Stop conditions

Stop feature implementation when FR-NW acceptance is satisfied and the scoped tests pass. Report unverified browser, environment, AI, operational, capacity and user-value gates. Do not infer that a feature is unique from this plan or that all project bugs are resolved.
