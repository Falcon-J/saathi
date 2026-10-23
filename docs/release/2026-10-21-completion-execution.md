# Completion execution — 2026-10-21

Execution continued on 2026-10-22 (Asia/Calcutta).

Publication review resumed on 2026-10-23. The user authorized coherent commits, a feature-branch push and a pull request. Merge and production deployment remain separate gates.

Plan: `docs/superpowers/plans/2026-10-21-saathi-design-review-and-implementation-plan.md`.

Status: in progress. This ledger records current execution; blocked requirements remain open and do not count as completed acceptance.

Latest hosted update: [October 23 recovery](2026-10-23-hosted-recovery.md). Both inactive Supabase projects were resumed; production readiness recovered to HTTP 200. The user-approved receipt-table migration was applied and catalog/privilege checks passed. Earlier 503 observations below remain historical. Performance and the other hosted release gates remain open.

## Decisions

- Reuse the existing feature checkout and preserve its pending changes. No commit, push or deployment authorization is inferred.
- Keep existing archive read-only behavior and Activity continuation. Restoration and broader AI capabilities are not added by default.
- Use a separate disposable SQL database on loopback port 55440 because another project's database occupies the repository's configured port 55439. Do not stop or modify the other project.
- Use supported webpack verification after the local Turbopack CSS worker failed before browser assertions. This does not verify the default Turbopack runtime.
- Do not count a documented blocker as a passing release gate.

## Current evidence

| Check | Result |
| --- | --- |
| Publication regression suite, October 23 | 282 tests: 280 passed, zero failures, two optional integration skips; includes the four new AI outcome cases. Nonincremental type check and scoped AI lint passed after the telemetry correction; full lint passed before it |
| Final registered unit suite | 278 tests: 276 passed, zero failures, two integration skips |
| Initial full TypeScript check | Passed with incremental disabled |
| Initial full ESLint | Passed |
| Fresh disposable database bootstrap and migrations | Passed |
| Eight registered database test files | 40 checks passed, zero failures/skips; includes Activity traversal and microsecond ordering, permissions, retries and paging |
| Optional integration checks | Both ordinary-suite skips exercised separately: six checks passed, zero failures/skips, including AI metadata authorization and migration-journal reconciliation |
| Public browser suite | 14 passed against the production webpack build at desktop and 360px; includes public auth, keyboard, accessibility and dashboard redirect |
| Production webpack build | Final integrated build passed, including TypeScript and 13 static pages; tested with matching loopback public auth configuration and real Redis configured |
| Task editor discard fix | Regressions failed before fix; 12 focused checks pass afterward, with scoped ESLint. Actual React/Radix browser harness reproduced Cancel focus loss before correction and passed afterward |
| Signed-in local production acceptance | Owner sign-in/reload, owner task creation/assignment, member completion and owner reload, outsider denial, desktop/360px layout/accessibility, dirty-editor keyboard recovery, and Activity traversal beyond 100 records all passed |
| Scoped architecture review | No remaining material finding in session changes; remote CI and hosted acceptance not established |
| Live Groq provider | Four synthetic contract/attention/draft checks passed; separate factual evaluation correctly counted one completed/two unfinished tasks and refused unavailable revenue data |
| Live AI through application | Owner and member advice succeeded against a real provider; drafting did not change DB task count; two immediate confirmation clicks produced exactly one saved task; outsider Server Action request denied without workspace task content or outsider operation record |
| Disposable SQL restore drill | Native pg_dump/pg_restore completed in 1.56 seconds. Nine table counts matched, ten tasks and member comment survived, outsider reads remained denied, 13 public RLS tables retained. SQL test identity schema only; this does not prove managed Auth restoration or hosted recovery objectives |
| Sustained-load verifier | `scripts/verify-nfr-local.mjs` passes syntax, ESLint and diff checks. Smoke: eight authenticated users, eight writes, all 16 expected recipient deliveries, no errors/duplicates and owned-fixture cleanup. Full run failed acceptance; see measured results below |

## Current requirement delta

Numbers follow the draft product requirements, matching the October 11 audit. Historical reports remain historical; the evidence table above names current verification.

| Requirement | Current evidence and remaining delta |
| --- | --- |
| FR-1 Identity/access | Current owner/member/outsider production journeys passed locally. Hosted confirmation/OAuth/recovery and timed revocation remain open |
| FR-2 Workspace lifecycle | Existing implementation retained, including read-only archive inspection. No restore feature added; full current lifecycle browser matrix remains unverified |
| FR-3 Invitations | Existing implementation and database tests retained. Real email/link and negative invitation browser journeys remain open |
| FR-4 Tasks | Current create/assign/complete/reload, permissions, dirty-draft recovery and focused concurrency/paging tests passed. This does not cover every failure path in a browser |
| FR-5 Comments/history | Database evidence retained; current Activity traversal beyond 100 entries passed. No restoration or editable archive behavior added |
| FR-6 Daily work | Current desktop/360px core journeys, keyboard/focus and scoped accessibility passed. Broader usability research and full invitation/archive interaction matrix remain open |
| FR-7 AI | Local live provider grounding, owner/member access, outsider denial, review-before-write and single confirmed persistence passed. Hosted configuration and broader live provider-failure matrix remain open |
| NFR-1 Consistency | Current database/receipt/outbox and integrated task journeys passed; sustained delivery and timed reconnect/revocation acceptance remain open |
| NFR-2 Security/privacy | Current local permission and AI isolation evidence passed. Hosted settings/log review and full negative acceptance remain open |
| NFR-3 Usability/accessibility | Current recorded core desktop/mobile and focus journeys passed; no claim of whole-product user acceptance |
| NFR-4 Performance/operations | Sustained local acceptance failed; disposable SQL restore passed. Hosted capacity, workers/alerts, deployment/rollback and recovery objectives remain open |

## Sustained workload result

Run `6ef81a76-b3bb-4551-bded-1b6c315c1852` used 100 authenticated identities, four workspaces with 25 members each, 750 seeded tasks per workspace and 1,000 measured writes. All identities performed reads and writes. Normal admission limits remained enabled.

- Result: **failed**. Writes did not complete within the measured 900-second envelope (plus the verifier's one-second tolerance).
- All 1,000 mutations, command receipts and durable task-created events passed database cross-checks before the envelope assertion. All 25,000 expected recipient deliveries arrived; zero missing or duplicate notifications and zero recorded request/stream errors across 9,186 attempts.
- Task-read latency: p50 3,896 ms, p95 11,275 ms, p99 15,502 ms. The p95 target is 750 ms.
- Write latency: p50 622 ms, p95 4,045 ms, p99 9,734 ms.
- Event delivery upper bound: p50 710 ms, p95 2,280 ms, p99 4,849 ms. The p95 target is 2,000 ms. This measures from a transaction-assigned timestamp preceding commit, not an exact commit timestamp.
- Exact owned database/Auth/Redis fixture cleanup completed and the test server stopped.
- The runner serializes writes and schedules subsequent reads after responses and think time. Profile achieved rate, schedule lag, generator resources and server/database/Redis time before attributing the bottleneck or changing application code. This local stack and Redis REST bridge do not establish hosted capacity.
- Sanitized raw result: [local NFR baseline](benchmarks/2026-10-22-local-nfr-baseline.json); source remains in the ignored `.local-test/nfr-<runId>/result.json`. The failure path does not retain measured elapsed time or operation samples; reproducible timing/replay evidence needs that addition. Revocation within 30 seconds and authoritative reconnect reconciliation within five seconds were not measured.

## Changes

- `AGENTS.md` now records the user's concise-interface and UX/DX/AX rules, retaining essential accessible names, validation, recovery and confirmation context.
- AI response guard failures use a service-owned error type so mismatched capabilities and invalid/duplicate task references record `invalid_response`; transport failures remain `provider_unavailable`. Three regressions failed before correction; all 14 focused checks pass afterward, with type check and scoped lint passing.
- `app/globals.css` excludes `.local-test` and exported `output` artifacts from Tailwind sources. Both contain prototype HTML; unresolved image placeholders must not enter application styles. No prototype files are deleted.
- `TaskEditorDialog` uses the existing confirmation dialog before discarding a changed draft through Cancel or Radix dismissal. An unchanged or read-only dialog closes directly. Pending saves block dismissal; successful saves retain their direct parent close path. Tests cover discard/cancel, conflict retention and successful save behavior.
- Cancelling discard restores focus to the still-mounted editor title through the existing confirmation primitive; explicit discard does not focus a detached editor.
- Board scope identity/version now changes only for a different workspace or filter reference. Same-scope layout replay previously invalidated pending reads without restarting the passive fetch effect, leaving loading stuck. The deferred-read regression failed before the fix; focused stale-workspace/filter/unmount checks and the integrated production journey pass afterward.
- Toast roots use list-item semantics while Radix's separate live announcement is retained. Native single-focus, Tab and Shift+Tab prove both hidden Radix sentinels redirect correctly. Playwright's convenience `focus()` calls native focus twice and was unsuitable for this test. The local runner excludes only these exact sentinel nodes from axe after keyboard verification, retaining the broader rule.
- CI now runs disposable PostgreSQL bootstrap, normal migrations and database checks. Database environment is scoped so the normal unit suite does not run optional database checks before preparation. Public browser tests receive synthetic loopback auth settings and need no real provider credentials. Remote CI is not run.
- CI browser checks start the development server; the separate build uses webpack. They must not be described as browser checks against that production build. Earlier local production-browser evidence is recorded separately above.

## Remaining gates

- Formal sustained workload failed the duration, read-latency and delivery-latency targets. Diagnose the bottleneck, retain the failed baseline, then repeat the comparable run after a justified fix.
- Default Turbopack build/runtime remains unverified in this environment; webpack evidence is named explicitly.
- Broader invitation/email, conflict/reconnect/revocation acceptance outside the specifically recorded journeys remains open; existing database/unit evidence is retained separately.
- Live AI is required before release, confirmed by the user. Local app/provider acceptance above passed; hosted environment configuration remains unverified. The supplied key is read from their exact external local env location and passed only to child processes; it is not printed or copied into this checkout.
- Sustained 100-user performance, revocation/reconnect targets, deployed readiness, email delivery, worker schedules/alerts, restore and rollback evidence.

## October 23 follow-up

- Latest ordinary suite: **325 tests, 323 passed, two optional skips, zero failures**. Production webpack build, nonincremental type check and scoped changed-code lint passed. Earlier remote CI passed for `5b3e0f6`; the changes below require a new CI run.
- Native stream open/resync and browser online events now invalidate the existing Board read revision. Actual production-browser reconciliation passed: authoritative read 356 ms, visible task 836 ms (five-second target). Idle permission revocation passed in 4,046 ms with reconnect denied by HTTP 403 (30-second target). These are separate local probes, not claims from the sustained runner.
- Post-commit outbox coalescing now retains a commit arriving during a short active flush, while retaining the four-batch cap. Deferred regressions passed. The database pool defaults to one; validated `DATABASE_POOL_MAX` permits 1 through 10. Five was used only for isolated local direct-Postgres diagnosis; hosted sizing still requires a connection budget.
- Proxy refreshes API and Server Action session cookies through SDK `getClaims()`. Handlers retain live `getUser()` and domain authorization; protected page GET retains live verification, confirmation redirect and outage behavior. Thirty-seven focused checks cover refresh cookies, forged GET headers, malformed/expired sessions and downstream denial of a revoked user.
- The verifier now schedules writes independently by identity, records failed-run elapsed time, intended/achieved rates, schedule lag, bounded sanitized timing samples and source/build fingerprints. Reads remain response-dependent with 15-second think time. `--diagnostic` is 100 users and 100 writes over 60 seconds; it does not establish acceptance. Default acceptance remains 1,000 writes over 900 seconds.
- Latest diagnostic `266b0123-71b6-471d-8c96-c44e263aa445`: 100 writes, 2,500 of 2,500 deliveries, zero request errors or duplicate notifications, elapsed 60,004 ms. Read p95 **1,181 ms** still fails 750 ms; write p95 1,948 ms; delivery upper-bound p95 **1,400 ms** passes 2,000 ms. Prior diagnostic before duplicate Auth removal measured read p95 8,801 ms and delivery p95 3,674 ms. Diagnostic pool maximum was five in both. No full acceptance rerun while the short read gate fails.
- Replay: `npm run report:nfr:local -- .local-test/nfr-266b0123-71b6-471d-8c96-c44e263aa445` generates a self-contained `report.html` with recorded timeline controls and no network requests. Failed performance gates display FAIL even when diagnostic functional execution succeeds. Five runner/report regressions pass; browser playback was verified separately. Raw fixture logs stay ignored.
- Review corrected throughput accounting to exclude warmup: 740 measured reads over 60,004 ms (12.33 requests/second). The original ignored result is preserved; the [sanitized diagnostic](benchmarks/2026-10-23-local-nfr-diagnostic.json) records the correction explicitly. Latency samples and verdict are unchanged.
- Owned fixtures and the separate Auth-capacity probe identity were removed. No shared infrastructure was deleted.
- Vercel Saathi preview at `5b3e0f6` is READY. The redundant `implementation` target has no environment variables and failed its build. Current production is a different main commit: liveness HTTP 200, readiness HTTP 503, login HTTP 200. Preview bypass access was explicitly authorized, but connector access still failed; hosted login/readiness and runtime logs remain unverified. No merge, production deployment or production configuration change occurred.

### Remaining release gates

1. Diagnose remaining read latency with the recorded phase evidence; pass the short gate, then run the unchanged sustained acceptance envelope.
2. Obtain working hosted runtime access, resolve readiness 503, and verify hosted AI, email, workers/alerts and operational recovery.
3. Finish the unverified invitation/lifecycle/negative browser matrix listed above. Local core journeys, live AI and recovery probes already passed; preserve that evidence.
4. Review and publish this bounded delta to draft PR #9, pass remote CI, then obtain explicit merge and production deployment authorization.

## October 23 remaining-gate execution

### Implemented and checked

- Task reads now use a shared live verified actor without fetching an unused username. Supabase `getUser`, confirmed email and domain membership checks remain mandatory. Mutation/other `getSession` callers retain matching profile validation. Eight lookup assertions failed before the correction; 58 focused auth/action checks passed afterward. Architecture review found no material issue.
- Redis stream bounds previously fetched and parsed the entire retained history for every delivering recipient batch. The new atomic Lua read uses native `XRANGE COUNT 1` and `XREVRANGE COUNT 1`, returning only oldest/latest IDs. Latest-entry reads also use native `XREVRANGE COUNT 1`; existing parsing, retry, production failure and mock behavior are preserved. Poll intervals, retention, permission checks and replay decisions are unchanged.
- Real local Redis/REST probe with the actual changed adapter passed at 1, 250 and 1,000 retained entries. Full-history response size grew from 221 to 221,894 JSON bytes; bounds responses remained 13 to 16 bytes. See [wire-cost evidence](benchmarks/2026-10-23-stream-bounds-cost.json). The observed sustained CPU/latency trend motivated this fix; no passing sustained-capacity claim follows from the probe alone.
- Latest registered suite: **360 tests, 358 passed, zero failures, two optional skips**. Focused Redis/replay/membership checks: 34 passed. TypeScript, scoped ESLint, diff checks and matching local production webpack build passed.
- **Ten local production-browser invitation/lifecycle checks passed:** member control restrictions, duplicate invitation idempotency, wrong-account denial, revoke, decline, expiry, accept/revisit, ownership transfer, archive retained/read-only inspection and active deletion. [Sanitized evidence](benchmarks/2026-10-23-local-lifecycle.json) retains the failed setup attempt and successful isolated delete follow-up. Fixtures, identities, exact Redis keys and owned servers were cleaned. These checks do not prove real email delivery/webhooks.

### Performance results retained without changing targets

| Run | Pool | Scope | Read p95 | Delivery upper-bound p95 | Verdict |
| --- | --- | --- | --- | --- | --- |
| `8881a31f` | 5 | Initial actor-only diagnostic | 20,234 ms | 42,220 ms | Failed with timeouts; cleanup passed |
| `cfbed98d` | 5 | Unchanged actor-only diagnostic repeat | 566 ms | 985 ms | Short targets passed; not acceptance |
| `933eafba` | 5 | Actor-only full 900-second acceptance | 4,493 ms | 8,163 ms | Failed envelope and latency; all 1,000 writes/25,000 deliveries, no request errors/duplicates |
| `63088c5a` | 5 | After bounded stream fix, diagnostic | 1,077 ms | 1,140 ms | Read target failed; all 100 writes/2,500 deliveries, no errors/duplicates |
| `5762b991` | 10 | Bounded fix, one-variable local pool experiment | 1,668 ms | 1,596 ms | Read target failed; all 100 writes/2,500 deliveries, no errors/duplicates |

The full run finished in 904,360 ms and failed the write-envelope assertion after database cross-checks. Its late-minute response times grew with retained stream history; server event-loop p95 reached 557 ms and CPU approached one core. After the bounded fix, the pool-five short diagnostic's maximum sampled server event-loop p95 was 47 ms. Different durations preclude a sustained-capacity conclusion.

Increasing the isolated local pool did not resolve the remaining short target. Measured live Auth p95 increased from 449 to 1,065 ms while profile lookup stayed near 65 ms; these are aggregate phase samples, not additive task-request percentiles. Do not attribute every remaining millisecond to SQL or replace live Auth verification based on this evidence. Default pool remains one; hosted settings were not changed. No new full acceptance run was started after the latest short read gate failed.

Each sanitized result is in `docs/release/benchmarks/2026-10-23-local-nfr-*.json`. Recorded playback remains available through `npm run report:nfr:local -- .local-test/nfr-<full-run-id>`. Both successful execution and failed performance gates remain visible. Raw logs and timing JSONL stay ignored.

### Hosted blockers refreshed

Historical October 23 snapshot below. Superseded by the October 24 hosted update in this document and the demo rehearsal; do not use these access/configuration findings as current status.

- Public production liveness is HTTP 200 and readiness HTTP 503. Protected preview fetch and runtime error queries still return provider 403 for the owning team. The requested readiness dependency log line is pending; the failing dependency has not been identified.
- Environment **names/targets only** were inspected: production has database, Redis, cron, email and Groq variables; preview has no Groq key. Presence does not prove working values. No secret was decrypted or copied.
- Current head `9f27461` passed GitHub CI and its Saathi preview was READY. Publication of this follow-up needs its own CI and preview verification. The user reported disconnecting the redundant implementation target; that dashboard change was not independently verified.
- Hosted readiness repair, live hosted AI/auth/email acceptance, worker schedule/alert drills, managed backup/restore and rollback remain open. Local SQL restore evidence above is retained. No production configuration, data, deployment or merge was changed.

### Next evidence boundary

Local functional gaps above are closed. Performance acceptance is **not passed**. Further capacity work should use a stable instrumented environment and working hosted access, retaining the unchanged thresholds, rather than repeated blind full runs or weaker authorization. Obtain the readiness dependency error and appropriate deployment/log access, repair that dependency, then run hosted journeys and the comparable sustained workload before release approval.

## October 24 performance evidence update

This update supersedes the earlier performance status only; hosted recovery and product/browser evidence remain recorded in their separate follow-ups.

- Presence heartbeat reads now use native `MGET`: the real adapter/installed SDK/local Redis probe verified two commands instead of 26 for 25 members. Expiry, cleanup, retry, mock policy and membership authorization remain unchanged.
- Gated profile diagnostics split connection reservation from client query elapsed time and release on success or failure. The normal path does not reserve; no identifiers or SQL parameters are logged.
- Two additional 60-second local diagnostics still failed latency targets: `ef216ba2` read/delivery p95 **5,348/8,169 ms** and elapsed **67,769 ms**; `29f240a8` **2,269/2,396 ms** and **60,219 ms**. Each retained all 100 writes/2,500 deliveries, zero request errors or duplicates, and exact fixture/server cleanup. No full sustained rerun followed.
- In the targeted run, profile reservation p95 was under one millisecond and client query p95 73 ms; aggregate live Auth p95 was 2,028 ms. Serial dependency checks were fast before and after. Resource and PostgreSQL snapshots do not establish a complete causal explanation or justify weaker Auth checks. Multiple module-owned pools remain a budget concern requiring separate review.
- Combined ordinary suite: **376 tests, 374 passed, zero failures, two optional skips**. Nonincremental TypeScript, scoped ESLint, four profile checks, 36 Redis/realtime/membership checks, and matching local production webpack build passed.
- [Detailed evidence, limits and replay commands](2026-10-24-performance-follow-up.md) and its two sanitized benchmark artifacts retain the failed gates. Default database pool and all thresholds remain unchanged. Performance acceptance is **not passed**.

## October 24 hosted update

- Vercel CLI authorization is restored. Preview head `09ce3185e76901ce65a73e73b9e0306acdc9d338` is READY with readiness HTTP 200 and green CI. Production remains separate and was not deployed by this work.
- Normal Google sign-in/reload, independent owner/member task completion, owner realtime observation/reload, grounded live AI summary and draft-to-one-confirmed-task persistence were rehearsed successfully. See [recorded demo rehearsal](2026-10-23-demo-rehearsal.md).
- Normal email signup confirmed the owned account, but its delayed automatic callback failed. Normal password sign-in and a fresh password recovery callback subsequently succeeded with the exact owned identity. Prompt new-signup acceptance remains open; no repeated signup loop or speculative Auth patch is justified.
- Resend's test sender rejects arbitrary invitation recipients. Copy-link invitation acceptance works. A verified sender domain is required for general invitation delivery.
- Performance acceptance remains failed. Hosted worker/alert, recovery and rollback status must be read from their specific evidence, not inferred from a successful demo. Merge and production app deployment remain unperformed.

## Caveman use

User requested Caveman. Its compression tool accepted a nonsensitive test summary. Automatic approval review rejected sending repository source/configuration to that destination as untrusted. Source inspection stays local; no bypass was attempted.
