# Ready and Waiting Performance and Acceptance Plan

> **For agentic workers:** Use superpowers:executing-plans. Browser harness preparation is delegated independently; production changes remain with the primary implementer.

**Goal:** Remove redundant handoff reads and verify the actual authenticated workflow and unchanged performance targets.

**Architecture:** Ready and Waiting owns its authorized graph read. Disable the unused full-list reader on this screen; route explicit reconciliation to the graph owner. Coalesce refresh bursts with one trailing read and preserve fresh authorization, account/workspace isolation and uncertain-command recovery. Diagnose remaining server latency with the existing local production verifier before changing server behavior.

**Tech Stack:** Existing Next.js, React, PostgreSQL, Supabase Auth, Redis and Playwright; no new product dependencies.

## Constraints and review focus

- Never cache completed authorization decisions, relax rate/connection limits, or lower acceptance thresholds.
- Do not expose credentials in evidence; local fixtures only, with exact cleanup.
- Requests queued before unmount/account change must not revive stale data or errors.
- Quick-add must reconcile uncertain results against authoritative data before retry.
- Several prerequisites must remain Waiting until all recorded prerequisites complete.
- Performance acceptance remains 100 real identities, 1,000 writes over 900 seconds, read p95 <=750ms, delivery upper-bound p95 <=2,000ms and unexpected failures <1%.
- A failed prerequisite environment is reported as a failed attempt, never as passing capacity.

## Task 1: Remove duplicated client reads

- [x] Reproduce redundant graph refreshes with behavioral tests.
- [x] Return the final result from coalesced refreshes, with regression coverage.
- [x] Disable the unused dashboard full-list subscription and use the mounted graph loader for explicit reconciliation.
- [x] Coalesce handoff refreshes and invalidate queued reads safely on unmount/scope changes.
- [x] Run the focused tests and verify no stale-account or pending-command regression.

## Task 2: Measure and fix remaining server bottlenecks

- [x] Start the retained disposable local Auth/PostgreSQL/Redis stack and run the existing smoke baseline.
- [x] Use timing evidence to choose any server fix, add its failing regression first and verify it.
- [x] Build the final production app and run smoke.
- [x] Pass the unchanged sustained acceptance workload on the final revision in disposable Linux CI.

## Task 3: Authenticated end-to-end acceptance

- [x] Run browser scenarios for creation, permissions, multiple prerequisites, completion/reopen, realtime handoff, navigation, retained drafts and mobile accessibility.
- [x] Fix actual workflow defects and rerun affected checks (no application defect found by authenticated acceptance; corrected harness locators/instrumentation).
- [x] Run full unit suite, database checks where applicable, lint/typecheck, independent review and production build.
- [x] Save sanitized evidence and exact fixture cleanup results; state remaining hosted-release limits.

## Investigation and evidence

Initial source investigation: dashboard enables `useWorkspaces` full-list reads while NextWorkView independently reads the complete graph; changed task lists trigger another graph read. Every graph refresh currently starts another action rather than coalescing in-flight work. Historical auth latency is not attributed to a new cause without reproduction. Proxy already uses getClaims for Actions/API and domain actions still use live getUser checks; do not redo that existing fix.

Measured follow-up: pre-fix production smoke read p95 1,458ms, delivery p95 1,097ms, 8/8 writes and 16/16 deliveries. Installed SDK source and actual-SDK test prove getClaims falls back to a remote getUser check for symmetric keys. Proxy cookie maintenance now calls getSession and ignores its identity data; all downstream live user/membership checks are retained. Actual fresh and expired session tests pass, including cookie refresh propagation and exactly one live identity request. This replaces the initial assumption that the existing getClaims proxy fix already avoided every duplicate network check.

Validation so far: 540 unit tests passed, two optional database integrations skipped; lint and production build passed. Independent static reviews found no blocking defects in graph lifecycle or the auth change. Added real-projection multiple-prerequisite/reopen and deferred account/workspace-switch tests. Authenticated browser and sustained gate results are tracked in the release evidence.

## Completed acceptance (10 November)

Docker is restored after user removal of the two stale runtime sockets. WSL memory is capped at 2GB with the previous configuration backed up. Exact local Auth, SQL and Redis fixture cleanup passed; retained services are healthy. Windows attempts remain failed/interrupted evidence.

Final head 7ec500141eef3826da694bccc9b8ab6b69476158 passes 577 unit tests (two optional DB skips), 63 real database tests, 14 browser tests, typecheck, lint and production builds. Authenticated Ready and Waiting owner/member/outsider acceptance passed. Independent reviews are complete.

The unchanged Linux gate passed: 100 identities, 1,000 writes over 900 seconds, all 25,000 unique deliveries, zero errors; read p95 97ms, write p95 184ms, delivery upper-bound p95 545ms. All users rotated through four SSE connections. Exact verifier and service cleanup passed. PR15 was reviewed and merged into main as a4e25edf596df15623fc80dbac578ca3605eab11; merged and tested trees match exactly. Evidence and links are recorded in docs/release/2026-11-08-ready-waiting-acceptance.md.

## Portable capacity verification

The retained Windows Auth service continues to hit deadlines even during disposable fixture preparation; an exact aggregate SQL probe succeeds and rolls back cleanly. Prepare a disposable Linux GitHub Actions job that runs the same verifier, original limits and 100-user / 1,000-write / 900-second workload. Publish only the task source and verifier on a separate draft PR; leave main and hosted application/data unchanged. Use fresh local Supabase Auth/PostgreSQL and Redis, real migrations, private captured configuration, sanitized artifacts and exact cleanup. Validate workflow changes on PRs that modify the workflow and allow manual repeat runs.

- [x] Verify connected repository access and identical current-main base tree.
- [x] Add bounded disposable Auth setup recovery with mandatory real provider login and exact ownership recovery.
- [x] Validate and independently review Linux setup, workflow and fixture configuration.
- [x] Run the unchanged full gate in CI; retain any failed attempts and exact cleanup evidence.
- [x] Reconcile the final release report with platform, source revision, counts and measured results.

## Live deployment and state-machine audit (10 November)

Scope: user requests latest verified release, live Ready and Waiting end-to-end acceptance, and all first-party implicit state machines with UX/DX/AX improvements. Preserve existing Next/React/Postgres/Supabase/Redis contracts and no new state library. Existing main 94bd9cc is deployed by Git integration; exact deployment and canonical production alias must be verified before fixture creation.

- [x] Split read-only inventory across independent client, auth/domain and coordination scopes.
- [x] Reproduce concrete recovery bugs with focused failing regressions before source changes.
- [x] Preserve comments and advisor drafts plus exact unknown-outcome command IDs across close/remount/reload.
- [x] Distinguish committed member removal/leave from failed subsequent refresh; expose password committed/session cleanup recovery.
- [x] Restore current-actor invitation replay and authorized terminal-state rendering without public disclosure.
- [x] Fix mock Redis heartbeat expiry consistency while preserving production commands.
- [x] Review scoped diffs, inventory reachable and dormant machines in CONTEXT, run full unit/type/lint/database/browser/build verification.
- [x] Publish/review/merge the tested fixes and verify exact production deployment.
- [x] Run real live owner/member/outsider Ready and Waiting scenarios, drafts/recovery, permission boundaries and mobile accessibility; remove exact owned fixtures and record sanitized evidence.

Review focus: committed-vs-refresh outcomes, exact command persistence before network dispatch, account/workspace/task draft isolation, current authorization on replay/terminal disclosure, and no stale expiry callback deleting refreshed presence. Live acceptance passed on the canonical public production app on 11 November. All Auth/SQL fixture rows were deleted and their absence rechecked on 12 November; the final Redis stream deletion was confirmed by the user (DEL returned 1). Production readiness and main CI are successful. No outstanding actions remain.
