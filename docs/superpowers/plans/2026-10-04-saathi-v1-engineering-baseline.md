# Saathi v1 Engineering Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if the user selects delegation. Execute task by task and stop at unresolved product or environment gates.

**Goal:** Improve existing v1 efficiency and contract clarity while proving the approved correctness and recovery requirements.

**Architecture:** Retain the modular monolith and PostgreSQL authority. Reuse existing authorization, version checks, outbox, and realtime recovery; change only demonstrated gaps.

**Tech Stack:** Existing Next.js, TypeScript, React, PostgreSQL, Supabase Auth, Drizzle, Redis Streams and SSE; existing Node test runner.

**Spec:** ../specs/2026-10-04-saathi-v1-engineering-baseline-design.md

## Global constraints

- Scope A only; no new product capabilities or speculative infrastructure.
- Preserve unrelated README modifications and untracked interview/closeout documents.
- No commit, push, deployment, production mutation, or external publication without explicit authorization.
- Numeric spec targets are acceptance objectives, not measured claims: 100 concurrent users; <=25 members and <=1000 tasks per tested workspace; warm API p95 <=750 ms; realtime p95 <=2 s; unexpected failure rate <1%; revocation <=30 s; reconciliation <=5 s; RPO <=24 h; RTO <=4 h.
- Keep security-sensitive rate limits fail closed unless the owner explicitly approves an alternative.
- Use disposable database and hosted test resources; never inject failures into production.
- Review budget, operating owner, availability commitment, and retention policy before claiming production readiness.

## Review focus

- Missing/stale version must reject mutation: Task 2 tests undefined, stale numeric and stale timestamp inputs.
- Clearing an assignee/deadline must differ from omission: Task 2 tests both paths.
- Lost network response after a committed create must not trigger blind replay: Task 3 exercises reconciliation and uncertainty feedback.
- Member removal during an active subscription must end protected delivery: Task 4 measures revocation on an open connection.
- Database commit followed by Redis failure must remain committed and retryable: Task 4 checks domain/activity/outbox and eventual delivery.

## Task 1: Establish executable baseline and correct evidence labels

**Files:** Read package.json, docs/product/saathi-v1-product-requirements.md, docs/architecture/saathi-v1-technical-architecture.md, docs/realtime.md; update the approved spec with verified status only; create docs/release/2026-10-04-engineering-baseline-evidence.md.

**Interfaces:** No product change. Evidence records source commit, environment, commands, outcomes, and limitations.

- [ ] Record git status and inspect all applicable repository instructions; choose an isolated execution checkout through using-git-worktrees if needed. Copy no unrelated work silently.
- [ ] Run npm run type-check, npm run lint, npm test, npm run build from implementation. Record prerequisites and actual outcomes rather than substituting mocks for provider proof.
- [ ] Run npm run test:database against an explicitly disposable database after its bootstrap/migration prerequisites. If unavailable, mark database verification pending and continue unaffected tasks.
- [ ] Correct the spec evidence: matchesTaskVersion rejects undefined; flushOutbox catches delivery failures. Inspect the entire SSE route before classifying active revocation as missing.
- [ ] Record baseline failures separately from proposed changes. Do not repair unrelated failures under this plan.

## Task 2: Make task failures actionable without breaking callers

**Files:** app/tasks/actions.ts, lib/data/tasks.ts, lib/task-permission.ts, hooks/use-workspaces.ts, app/tasks/contract.test.ts, lib/task-permission.test.ts, lib/data/collaboration.test.ts; add lib/task-errors.test.ts and register it in package.json only if needed for isolated checks.

**Interfaces:** Preserve success/error/task fields and existing action arguments. Extend TaskMutationResult.code to unauthenticated, forbidden, validation, not_found, conflict, rate_limited, unavailable; preserve retryAfterSeconds. Extend TaskError with an explicit code, default unavailable. Do not implement the spec's generic result envelope across unrelated actions in this slice.

- [ ] Search every TaskError construction and every updateTask/toggleTask/deleteTask/assignTask caller, including test and AI paths.
- [ ] Pin existing version behavior with assertions: matchesTaskVersion(2, timestamp, undefined) is false; expected 1 is false; expected 2 is true; exact compatibility timestamp is true.
- [ ] Add failing checks that stale mutation returns code conflict; unauthenticated mutation returns unauthenticated; malformed updates return validation; unrelated member edits return forbidden. No raw database messages escape.
- [ ] Add database checks that omission preserves assignee/deadline while explicit clear removes them. Reuse current contract representations; do not invent null semantics without checking normalizers and callers.
- [ ] Implement coded TaskError mapping and minimal caller conflict reload/feedback. Preserve compatibility timestamps until all relevant callers are audited; no forced signature migration in this task.
- [ ] Run focused Node checks, npm run test:database, type-check and npm test. Confirm success shapes and rate-limit retry hints remain compatible.

## Task 3: Remove per-task read queries and verify client reconciliation

**Files:** lib/data/tasks.ts, lib/data/collaboration.test.ts, hooks/use-workspaces.ts; existing dashboard recovery tests; evidence document.

**Interfaces:** listTaskRecords(actorId: string, workspaceId: string): Promise<Task[]> remains unchanged. Extract only a private row-to-Task mapper shared by list reads and projectTask; keep public record shape, status conversion, email projection and date semantics.

- [ ] Add integration assertions for no tasks, multiple tasks, null assignee/deadline, date-only and instant deadlines, and non-member denial. Pin stable created_at ordering with id as a tie-breaker.
- [ ] Add a focused runnable query-count check or controlled database instrumentation: task-list query count must not grow with task count. Keep authorization checking in the existing read-only transaction.
- [ ] Replace ID lookup plus per-record projection with one joined task projection scoped to workspace. Retain single-record projection for mutations; reuse the private mapper.
- [ ] Run focused database checks and compare records before/after on representative seeded fixtures. Confirm date-only values do not shift with timezone.
- [ ] Exercise optimistic mutation failure and network-unknown outcome: reload authoritative records, show uncertainty, and do not automatically repeat addTask, toggleTask or CSV import. Add a minimal regression check only if code changes are needed.
- [ ] Measure 10/100/1000-task reads; record query count and timings. Run type-check and npm test. Pagination is deferred unless the accepted envelope fails after this optimization.

## Task 4: Prove authorization revocation and delivery recovery

**Files:** app/api/realtime/route.ts, lib/realtime-sse.ts, lib/data/events.ts, corresponding existing realtime/database tests, docs/failure-exercises/, docs/realtime.md.

**Interfaces:** Keep authenticated GET /api/realtime, Last-Event-ID, resync-required, and flushOutbox(workspaceId?: string): Promise<OutboxFlushResult>.

- [ ] Inspect authorization rechecks, poll/heartbeat timing, abort handling and cleanup in full. Retain working mechanisms.
- [ ] Add or reuse a check: open subscription -> remove membership -> no protected payload after <=30 seconds; denied subscription/commands remain denied. If absent, minimally recheck authorization within that window and close with cleanup on denial or verification failure.
- [ ] Exercise duplicate IDs, old/future cursors, reconnect and workspace switching; assert authoritative reconciliation and no cross-workspace merge.
- [ ] Force publication failure in disposable infrastructure: mutation returns committed success, domain/activity/outbox remain present, pending outbox later publishes, duplicate delivery causes no duplicate domain record.
- [ ] Verify Redis limiter outage yields an explicit unavailable response for protected writes; document degraded realtime behavior and actual read availability.
- [ ] Run realtime and database suites, capture measured revocation/recovery timing, and update failure exercises with reproducible steps. Do not replace SSE or loosen locking without new evidence.

## Task 5: Validate retained product journeys and integration boundaries

**Files:** Existing auth, invitation, comments, CSV, advisor/intent tests and action modules; docs/release/2026-10-04-engineering-baseline-evidence.md. Modify product files only for failures reproduced here.

**Interfaces:** Preserve existing action contracts and partial CSV import semantics; AI confirmation remains explicit and permission checked.

- [ ] Run owner -> workspace -> invitation -> second user accepts -> task assignment -> completion -> observation -> refresh journey in an isolated hosted environment.
- [ ] Check signup confirmation, OAuth callback, session refresh, password recovery, logout, and invitation navigation. Provider callback alone does not pass authentication acceptance.
- [ ] Check comments, activity, durable usage, archive rejection, removal/unassignment and ownership transfer with negative actor cases.
- [ ] Check CSV <=512 KiB/100 rows, invalid rows, partial results and rate-limit failures. Whole-file retry is not promised idempotent.
- [ ] Check disabled/failed AI leaves manual work available, unauthorized projection is denied, draft validation rejects malformed input, confirmation rechecks permissions, and repeated confirmation within its documented claim window is bounded. Do not claim durable deduplication beyond that window.
- [ ] Check keyboard journeys, visible focus and 360 px viewport. Use available browser tooling; no browser test dependency installation unless separately justified.
- [ ] For each reproduced code defect, write the smallest failing regression, implement the shared root-cause fix, and run focused validation. Architectural changes discovered here need a supplemental design before implementation.

## Task 6: Measure beta envelope and close operational gates

**Files:** scripts/load-test.ts, scripts/loadtest-k6* (inspect exact existing files), docs/benchmarks/, docs/release/2026-10-04-engineering-baseline-evidence.md, operational-readiness documentation. Provider settings require explicit applicable authorization.

**Interfaces:** Reuse existing authenticated benchmark and production-disabled publisher. No new load-test service.

- [ ] Prepare disposable sessions/workspaces, seed representative data and record topology, regions, runtime limits and test commit. Never record secrets or session cookies.
- [ ] Run >=15 minutes at the approved 100-user envelope and >=1000 observed operations/events; report p50/p95/p99, throughput, connections, unexpected failures, reconnect timing and provider usage. Separate AI/email latency from core API measurements.
- [ ] Compare against API p95 <=750 ms, realtime p95 <=2 s, unexpected failures <1%, reconciliation <=5 s. Tune only a measured bottleneck; rerun only affected checks.
- [ ] Record database/Redis/hosting/AI costs; obtain an owner-approved budget before treating NF12 as closed.
- [ ] Obtain recovery/alert ownership and retention decisions. Restore a backup into an explicitly approved disposable target and prove RPO <=24 h/RTO <=4 h with integrity and application checks.
- [ ] Exercise dependency/outbox alerts and email signature, delivery and duplicate-webhook handling. Record observation evidence, not configuration screenshots alone.
- [ ] Run final type-check/lint/tests/build and database checks on the final changes. Update traceability FR01-FR12/NF01-NF12 with pass/fail/pending, not a blanket complete label.

## Task 7: Complete capability inventory and add minimal feature controls

Design dependency: obtain review of specification section 10 before implementing this task. It adds FR13 and explicit functionality-completion criteria to the previously approved baseline.

**Files:** lib/feature-flags.ts, lib/feature-flags.test.ts, app/actions/workspace-intent.ts, app/actions/workspace-advisor.ts, app/actions/migration.ts, app/dashboard/page.tsx, app/guide/page.tsx, .env.example; locate the actual CSV control through overview-capabilities.ts and its callers before editing; execution evidence document.

**Interfaces:** Keep isAiWorkspaceEnabled(value?: string): boolean parsing compatibility. Add resolveFeatureFlags(env: { ENABLE_AI_WORKSPACE?: string; NEXT_PUBLIC_ENABLE_AI_WORKSPACE?: string; ENABLE_CSV_IMPORT?: string }): { aiWorkspace: boolean; csvImport: boolean }. Server callers pass their environment; browser callers receive only resolved booleans from a server boundary. Do not import server environment access into a client bundle.

- [ ] Populate the capability matrix for FR01-FR13 before code changes: identify real UI/actions, permissions, refresh behavior, test evidence and unresolved gaps. Use the existing project map as input, not proof of completeness.
- [ ] Add resolver tests: empty config => AI false/CSV true; server AI false overrides public true; absent server AI retains legacy true; invalid explicit values disable the affected capability; true enables it. Verify no permission decisions depend on flags.
- [ ] Run the existing Node feature flag test command to confirm newly added expectations fail before implementing the resolver.
- [ ] Implement the resolver in the existing module. Keep parsing strict and diagnostics free of sensitive configuration. Add server action checks for AI generation, advisor, confirmation and CSV import before provider work or mutation.
- [ ] Add action checks that disabled AI performs no provider call or write and disabled CSV imports zero tasks. Test direct invocation with stale UI capabilities. Retain auth/authorization checks independently.
- [ ] Resolve capabilities in a server boundary and pass them into dashboard/guide/CSV controls. Remove client-side build-time AI authority only after auditing every isAiWorkspaceEnabled caller. Preserve manual workspace creation and task operations with AI off.
- [ ] Document environment defaults, legacy precedence, redeploy requirement, in-flight boundaries, operational owner role, and flag review conditions in .env.example and the evidence document. Do not install a flag service or change live settings.
- [ ] Run focused flag/action checks, type-check and npm test. Exercise UI on/off with both roles and verify existing data remains accessible. Review every matrix row; create a focused follow-up slice for each reproduced gap, never silently mark it complete.

Execute the capability inventory portion immediately after Task 1, and implement flags before Task 5 so hosted journeys cover both enabled and disabled modes. FR13 is included in final traceability and acceptance; incomplete hosted evidence remains explicitly pending.

## Completion and handoff

## Follow-up slices: functionality, simple UX and guide foundation

Spec dependency: section 12 is a proposed follow-up. The member detail defect is confirmed; broader default navigation/assistant presentation changes require design review before product edits. Onboarding and AI help implementation remain later scope.

### Slice 8: Member detail and comment access

Files: components/task-list.tsx and the actual task-card owner identified through its imports; components/task-comments.tsx; components/workspace-overview.tsx; components/workspace-task-navigation.test.cjs; existing comments database tests.

- [ ] Trace Board title and Overview deep-link paths and separate canRead from canEdit/canComplete. Record every caller of the existing detail-opening function.
- [ ] Add a failing regression: ordinary member can open a creator-owned task, read its fields and post a comment; editing/deleting remain unavailable, while assigned-member completion remains available.
- [ ] Reuse existing detail surface with read-only fields and member comments; enforce writes through existing domain commands. No parallel detail renderer.
- [ ] Verify owner/creator/assignee/ordinary member and removed-member behavior locally and in independent Chrome/in-app sessions. Refresh both sessions and inspect comment persistence/activity.
- [ ] Run focused navigation/comment tests, database suite, type-check and relevant browser checks; update FR04/FR07 evidence independently.

### Slice 9: Close FRS journeys and review simple UX

- [ ] Extend the existing evidence matrix with scenario/preconditions/input/result/failure/persistence fields for FR01-FR13; retain historical evidence without promoting it to current proof.
- [ ] Run the five journey stages in specification section 12 using current authorized test resources; classify each as pass/fail/pending with specific limits.
- [ ] Review the existing UI for one clear next action, consistent vocabulary, optional AI visibility and progressive disclosure. Present the proposed Overview default and contextual assistant approach for approval before behavior changes.
- [ ] Verify keyboard, 360 px layout, refresh/deep-link navigation and recovery actions on approved changes; preserve current feature access.
- [ ] For each reproduced defect, add its smallest regression and shared root-cause fix. Do not expand scope to redesign unrelated screens.

### Slice 10: NFR and truthful guide readiness

- [ ] Continue Task 4/6 revocation, reconnect, provider failure, workload, alerts and restore checks. Use current resources as authorized; defer fresh deployment setup, not evidence classification.
- [ ] Measure task reads on 10/100/1000 records before claiming latency improvement; record region, warm/cold state, sample count and distribution.
- [ ] Reconcile lib/product-guide.ts, lib/overview-capabilities.ts, app/guide/page.tsx and app/help/page.tsx with completed FRS, permissions and flags. Add guide checks for member detail access and AI-off behavior.
- [ ] Draft onboarding state transitions and bounded help-answer acceptance questions only after core journeys are green. Do not install tour, RAG or agent frameworks during this core-hardening plan.
- [ ] Publish a final FR/NFR matrix distinguishing verified behavior, provider-dependent checks and deployment-day gates. Overall completeness is blocked by unresolved critical FRS failures.

### Slice 11: AI boundaries and economical execution

Design dependency: review specification section 13. Files: lib/ai/workspace-advisor-service.ts and its existing tests; lib/ai/workspace-advisor.ts; app/actions/workspace-advisor.ts and action tests; lib/groq-chat.ts and existing provider tests; existing product-guide documentation.

- [ ] Add failing service tests: summarize request rejects draft_task response; attention references outside supplied task IDs are rejected; legitimate responses remain accepted. Add action checks that invalid/disabled requests cause no task listing/provider work and unauthorized users never reach provider/quota-sensitive data.
- [ ] Implement semantic validation using the existing schema/request capability and a Set of supplied task IDs; treat task text as untrusted context. Reorder early validation/flag, membership, quota, projection and provider processing without relaxing authorization.
- [ ] Design exact bounded projection/token limits in this slice before changing payloads; derive authoritative summary/attention facts using existing deadline/timezone utilities. Test full-dataset totals, truncation visibility and date boundaries; no invented inactivity/dependency rules.
- [ ] Extend the existing adapter with response usage capture and bounded output configuration only where measured/evaluated; preserve provider refusal, invalid JSON and timeout handling. Zero cost placeholders must be labelled unmeasured, not actual costs.
- [ ] Run per-capability correctness fixtures and record quality, latency/calls/tokens before changing model selection. Current adapter reuse is preferred over a new gateway.
- [ ] Defer caching until repeated-request measurements justify it; if implemented, test membership rechecks, context/date invalidation and scope separation. No model-based router for explicit capability selection.
- [ ] Keep product help and onboarding explanations separate from workspace advisory context and reviewed write proposals. Future implementation has its own acceptance review; this slice does not add a generic chatbot or retrieval system.

Each task is independently reviewable; retain working baseline behavior and stop editing when its checks pass. Operational gates can remain explicitly pending while local code fixes are complete. Commit steps are omitted because the user has not authorized commits.

The implementation plan requires user review and execution-method selection. Recommended: inline execution with checkpoints after Tasks 2, 3 and 4. Delegation is optional only if selected. No product edits have been made by writing this plan.
