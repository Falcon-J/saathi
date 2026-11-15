# Ready and Waiting acceptance

Current status (12 November): complete. Main 9d6ef0ddd201b25e35764e371748db8020215899 is deployed; CI and all 28 live production scenarios passed. Exact Auth/database fixture absence was rechecked, and the user confirmed the final Redis stream DEL returned 1. No outstanding actions remain for this scope.

## Changes

- Ready and Waiting owns the default dashboard graph read. Refresh bursts coalesce to one active read and one trailing read; stale account/workspace work is cancelled. Quick-add retains authoritative uncertain-result recovery.
- Cookie maintenance avoids a duplicate remote identity check. Actions/API requests still verify live identity and workspace membership; protected page GETs retain live verification. Actual-SDK fresh/expired-session regressions cover propagation.
- Task pages, aggregates and graphs each use one authorized SQL statement with a shared snapshot, native cursor precision and unchanged DTOs. Mutation locking and subsequent fresh membership checks remain separate.
- SSE batches exact actor/workspace membership pairs without caching completed authorization. Uppercase workspace UUIDs use the canonical stream. Limits, normal rotation and checks before delivery remain unchanged.
- Outbox claiming retains atomic SKIP LOCKED/token semantics while removing redundant BEGIN/COMMIT round trips. Presence set updates now add members and refresh expiry atomically, retaining two Redis RPCs.
- Disposable fixture setup has bounded transient recovery and still requires real provider password sign-in. Exact generated-email recovery captures unacknowledged creates for cleanup. The measured workload is unchanged.

## Functional and source checks

[Final-revision general CI](https://github.com/Falcon-J/saathi/actions/runs/42698922713) passed typecheck, lint, 577 unit tests (two optional DB checks skipped), all 63 real database tests, all 14 browser tests and production build. [Recorded results](2026-11-10-ci-general.json).

The real owner/member/outsider browser run passed creation, assignment, several prerequisites, live Waiting→Ready→Waiting on completion/reopen, prerequisite/dependent links, edit boundaries, outsider SSE denial, retained drafts/recovery/discard/cancel, navigation, keyboard focus, 360px layout and serious/critical axe checks. Native uppercase-UUID EventSource delivery passed through actual route/SQL/Redis. All 22 graph responses were HTTP 200; zero full-list getTasks actions. [Browser evidence](2026-11-09-ready-waiting-browser.json), [desktop](browser-evidence/2026-11-09-ready-waiting-desktop.png), [mobile](browser-evidence/2026-11-09-ready-waiting-mobile.png).

An intermittent registration contrast failure exposed a disabled-to-enabled opacity transition during hydration. The auth submit now stays opaque; disabled behavior and loading/recovery remain intact. Final CI’s 14 browser checks include the mobile axe regression.

The presence adapter passed 17 focused checks and a [real Redis expiry probe](2026-11-10-presence-expiry.json): duplicate-member refresh survived the original expiry deadline, inactivity expired the set, and its exact key was removed.

## Capacity gate

100 real Auth identities, four workspaces, 25 members each, 750 seeded tasks per workspace, 1,000 writes over 900 seconds. The verifier requires durable mutations/events/receipts, 25,000 unique recipient deliveries, real four-minute stream rotation, read p95 ≤750ms, delivery conservative upper-bound p95 ≤2,000ms and unexpected failures <1%. Normal limits remain; pool maximum remains 1 per loaded pool. Fixture password sign-ins are paced outside measurement under the normal Auth quota.

[First complete Linux run](https://github.com/Falcon-J/saathi/actions/runs/42689992588), head 804ecc5, passed: 1,000 mutations/events/receipts, 25,000 deliveries, zero errors, every user connected four times. Read p95 was 183ms; write p95 was 272ms; delivery upper-bound p95 was 574ms. Measured elapsed 900,157ms; write schedule lag p95 was 1ms. [Full JSON](benchmarks/2026-11-10-linux-acceptance-804ecc5.json).

[Final revision capacity gate](https://github.com/Falcon-J/saathi/actions/runs/42698922604) passed on head 7ec5001 (tested merge 98d1f0a), including atomic presence expiry and the unchanged acceptance envelope: 11,910 reads with p95 97ms; 1,000 writes with p95 184ms; all 1,000 durable events and receipts; all 25,000 unique deliveries with upper-bound p95 545ms; zero errors, missing deliveries or duplicates. Every identity established four SSE connections. Measured elapsed time was 900,114ms. [Final JSON](benchmarks/2026-11-10-linux-acceptance.json).

Windows attempts are retained as failed/interrupted evidence in benchmarks. The retained Windows Auth service hit request deadlines even in fixture setup; an exact aggregate SQL probe against that database passed and rolled back. An isolated server needed 38 seconds to start, so setup readiness now has its own phase and 120-second allowance. Read/delivery targets and the measured 900-second interval are unchanged. Platforms differ, so mixed Windows/Linux results do not quantify a causal wall-clock speedup from code alone.

## Docker and cleanup

The user cleared stale dockerInference and userAnalyticsOtlpHttp.sock while Docker was stopped; fresh startup succeeded. Retained PostgreSQL/Auth/Kong/inbucket and Redis are healthy. WSL’s prior 6GB maximum exceeded practical headroom on this 6GB Windows host; its configuration was backed up and the cap reduced to 2GB, confirmed in the guest. [Runtime record](benchmarks/2026-11-10-local-runtime-repair.json). No factory reset, broad Docker purge or volume removal was used locally.

[Local cleanup audit](2026-11-10-local-cleanup.json) verifies zero Auth accounts, profiles, workspaces, tasks, activity/outbox rows, receipts, comments, dependencies, invitations and memberships for owned fixtures. One unacknowledged Auth create was recovered by exact generated email and UUID. 39 legacy QA Redis keys were removed only after proving absent workspace/account records and expired presence timestamps; Redis now has zero keys. Owned SQL-only databases were dropped and absence verified. Port 3101 is free. Evidence/manifests remain for review.

Both passing CI runs removed exact fixture rows/Auth accounts/Redis keys and stopped the app. The final run also passed its always-run cleanup of the exact disposable Supabase project and Redis container. Acceptance is complete. Final review found no blocking defects; a fresh local unit run passed 577 tests with two optional DB skips and zero failures. PR15 was merged on 10 November at the user’s request.

No hosted deployment, hosted-capacity SLA or revocation-timing SLA is claimed.

## Post-merge recovery contrast follow-up

Main push CI 42754225790 exposed an intermittent password-recovery submit contrast failure during hydration (3.24:1). The deterministic browser regression held client scripts and reproduced the disabled opacity at 0.5. The recovery submit now remains opaque, matching sign-in; disabled/pending and duplicate-submission guards remain intact. No capacity code or limits changed.

[PR16](https://github.com/Falcon-J/saathi/pull/16) passed [all CI checks](https://github.com/Falcon-J/saathi/actions/runs/42755181397), including 577 unit tests (two optional skips), 63 real database tests, all 16 desktop/mobile browser tests, typecheck, lint and production build, and was squash-merged as 94bd9cc42ee99bf373d96e8849c95faf521c2f7c. The local full unit and 16-browser suites also passed. Final main CI: https://github.com/Falcon-J/saathi/actions/runs/42756029300.

Final main CI 42756029300 completed successfully, including typecheck, lint, the full unit and database suites, all 16 browser tests, production build and disposable-service cleanup. Main tree 938ddc17bc70764d2fab9a743605064d95f31511 exactly matches the verified PR16 tree. Both PR15 and PR16 are merged.

## Live production acceptance (11 November)

The canonical public application at https://saathi-ten.vercel.app passed 28 owner/member/outsider scenarios using real hosted Auth/PostgreSQL/Redis. This includes multiple prerequisites, Waiting→Ready→Waiting through completion/reopen, live delivery, canonical uppercase SSE, reconnect reconciliation, permission boundaries, accepted-link reload recovery and removed-member denial, comment close/reload preservation, a dropped committed response recovered with the same command and one SQL comment/receipt, quick-add/editor drafts and discard, task links, search, keyboard focus and desktop/mobile serious/critical axe checks. Mobile360px has no overflow. No product-code fix was needed.

[Live evidence](2026-11-11-live-ready-waiting.json) and desktop/mobile screenshots record the run. All three test accounts were globally signed out; exact guarded SQL cleanup removed the workspace, three tasks, dependencies, comment, invitation, receipts, activity/outbox rows and profiles. A final audit confirms zero remaining rows in all thirteen checked categories, including Auth users/sessions. The first browser cleanup request was interrupted by teardown; the guarded SQL cleanup completed it. Production readiness returned200/ready afterward.

Runtime cache cleanup completed on 12 November: the user executed the exact stream DEL in Upstash and confirmed a return value of 1. This is user-confirmed deletion rather than an independent Redis re-read. All fixture cleanup is complete; bounded presence/rate/lease keys expire separately.

## Final closeout (12 November)

Production readiness returned HTTP200/ready; main remains 9d6ef0ddd201b25e35764e371748db8020215899; main CI 42766871515 is successful. A fresh exact-ID SQL audit returned zero in all thirteen fixture categories. The final runtime cache deletion is user-confirmed (DEL returned1). All requested work is complete.
