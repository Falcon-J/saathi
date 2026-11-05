# Review remediation and verification ledger

Branch: `codex/review-remediation`. Base: `41ef5c34b83fef7c6da2a04bf385a0b39f01dd3a`. This ledger covers uncommitted local changes; it is not evidence of deployment.

The [original review](2026-11-05-persona-qa-review.md) records the pre-fix findings. The [implementation plan](../superpowers/plans/2026-11-05-review-remediation.md) records scope. The reviewed functional, security and UX repairs are verified. **Performance qualification remains open, so this is not an unrestricted-release sign-off.**

## Implemented repairs

| Finding | Repair | Regression evidence |
| --- | --- | --- |
| QA-01 realtime controls | Validate domain events before deduplication; process idless controls independently; reject stale source callbacks and invalid/wrong-workspace envelopes | Actual hook and shared schema/helper tests; inherited-ID, malformed control, invalid-ID poisoning and replaced-source cases demonstrated red then green |
| QA-02 settings version | Capture draft and base version together; pristine refresh, retained dirty draft, explicit latest-state review and returned-version adoption | Settings behavioral regressions demonstrated red then green |
| QA-03 rate counting | Atomic Redis Lua increment and first-use expiry without resetting concurrent increments; fail closed on configured dependency failure | Concurrent admission, expiry and failure tests demonstrated red then green; real Redis concurrency/TTL/outage assertions passed |
| QA-04 shared invitation quota | Actor quota first; validate recipient, lock/recheck current owner, reject existing members and reuse pending invitation before shared quotas | Unauthorized/invalid/replay quota regressions demonstrated red then green |
| Invitation post-commit failures | Preserve committed results when cache invalidation fails; scope delayed inbox operations to the originating account | Cache failure, account-switch, unmount and delayed-error regressions pass |
| Authentication hydration | Keep authentication and password-recovery controls disabled until hydration attaches client behavior, preventing premature native form submission | Targeted authentication/recovery regressions: 18 passed, zero failures |
| Authentication recovery | Distinguish provider outages and rate limits from invalid credentials; isolate optional browser-storage notifications from committed authentication | Red/green action and dashboard regressions; normal login persistence passed in production |
| Production settings conflict guidance | Return an explicit safe result for expected conflicts while retaining the existing workspace action contract; never render arbitrary thrown server errors | Targeted regressions passed; production two-tab retry rejected stale save, retained draft, reviewed latest state and saved version 3 while preserving the untouched remote goal |
| UX-01 false empty states | Failed task reads suppress progress/empty claims while keeping draft owner mounted; failed workspace refresh retains existing editor with a stale-data warning | Overview and actual dashboard regression tests pass |
| UX-02 timezone ambiguity | Name browser-local editor zone and workspace display zone; reject nonexistent/repeated new wall times; preserve unchanged stored instants | UTC/Kolkata/DST and actual quick-add conversion tests pass |
| UX-03 workspace context | Remember selection per account in tab storage and validate against current memberships; select accepted workspace after successful authorized refresh | Reload, account isolation, revoked selection and accepted-workspace tests pass |
| UX-04 navigation | Intentional view changes push history; browser hash navigation restores views; retained stale-account refresh callbacks are ignored | Actual dashboard and hook behavioral tests pass |
| UX-05 competing surfaces | Overview leads with tasks and quick-add; full readiness/dependency view loads only when requested | Dashboard test confirms no initial dependency-view mount |
| UX-06 drafts | Guard intentional departures; persist validated settings/quick-add/editor snapshots per account/workspace for route recovery; clear on successful save/discard and account logout | Remount, base-version preservation, namespace isolation, corrupt storage and failed logout regressions pass |
| UX-07 conflict recovery | Fetch latest task without discarding local edits; show current values and explicitly rebase changed fields | Conflict/rebase regressions pass; off-page restored edit retains captured version |
| Smaller UX findings | Remove duplicate pencil action; compact empty inbox; say Create invitation; explain leave/remove consequences | Accessible edit action retained; invitation and mobile/desktop browser checks passed |
| Mobile Board inner overflow | Explicit single-column mobile grid and shrinkable column prevent long titles from expanding the inner board beyond the viewport | Stronger browser geometry/title-scroll assertion failed before the fix and passed after; before/after screenshots visually inspected |

## Dependency and development setup

Next and its ESLint configuration are updated to 16.4.5; Zod to 4.6.7. Unused `@auth/core` is removed. Targeted transitive updates and two scoped development-tool overrides remove the remaining registry advisories. Both full and production dependency audits report **zero vulnerabilities** at this check; this is not proof that the application has no security defects.

The Zod migration preserves environment defaults, validation messages, records and optional task updates. An oversized-array regression demonstrated the old advisory behavior before the upgrade. Project `typeRoots` excludes broken ancestor type packages without deleting unrelated files or disabling type checking.

Primary references: [Next release](https://github.com/vercel/next.js/releases/tag/v16.4.5), [Zod patch](https://github.com/colinhacks/zod/pull/6652), [Zod migration guide](https://zod.dev/v4/changelog), [minimatch advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249), [esbuild advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).

## Verification

| Check | Result and boundary |
| --- | --- |
| Clean locked install | Passed; 698 packages. Command-scoped Windows OS override corrects this host's global Linux npm setting without changing it |
| Full unit suite | **482 total: 480 passed, two skipped, zero failures**; latest full run includes the settings-response repair |
| Database suite | **55/55 passed**, zero skips, disposable PostgreSQL |
| Separately enabled integrations | AI metadata authorization **3/3**, migration-journal reconciliation **3/3**, zero skips. Both skipped unit integration cases ran here; other cases overlap the unit suite |
| Lint and standard typecheck | Passed after final changes; no type-discovery bypass or ignored build errors |
| Production build | Passed, including TypeScript and 12 static pages; Node 22, one build worker, isolated local configuration, external AI/email disabled |
| Dependency audits | Full and production audits: zero reported vulnerabilities; Drizzle and legacy transform-loader checks also passed |
| Core signed-in personas | Passed with real local Auth/PostgreSQL/Redis: owner/member workflow, outsider isolation, recipient-bound invites, replay/idempotency, invitation revocation, keyboard/accessibility and activity pagination |
| Public browser suite | **14/14 passed**, desktop/mobile, original assertions and 30-second budgets, one system-Chrome worker |
| Extended browser scenarios | Passed: two-tab settings conflict/rebase, draft reload/discard, Back/Forward, workspace selection and draft isolation |
| Mobile Board regression | Stronger nested bounds failed before the CSS repair; title and column viewport/scroll checks, serious/critical axe and focus checks passed afterward; screenshots visually inspected |
| Existing member revocation | Stream closed in **2,312 ms**; subsequent usage and SSE reconnect **403**, owner access retained; [portable evidence](benchmarks/2026-11-05-member-revocation.json) |
| Real Redis | Atomic concurrent counter/expiry and outage recovery passed; adapter fanout **600/600**, p95 **2,485 ms**. This is not HTTP SSE capacity |
| Real Redis connection leases | **200 attempts: 5 admitted, 195 rejected**, as configured; admission p95 **295 ms**, retry/expiry/release checks passed |

The unit suite preceded the final CSS-only layout change; the final production build, focused browser regression, relevant component tests, lint and typecheck cover that change. Functional checks do not establish sustained capacity. [Machine-readable remediation evidence](2026-11-05-remediation-evidence.json) records the working-tree fingerprint and boundaries.

Mobile Board visual evidence: [before](browser-evidence/2026-11-05-mobile-board-before.png), [after](browser-evidence/2026-11-05-mobile-board-after.png). Document-width checks initially missed clipped inner content; the repository's authenticated QA script now retains nested-overflow assertions.

## Performance gate remains open

| Local run | Functional outcome | Latency / limit |
| --- | --- | --- |
| [Eight-user smoke](benchmarks/2026-11-05-local-nfr-smoke.json) | 0/8 writes and 0/16 deliveries; failed result envelopes | Original failure cause remains unresolved |
| [100-user diagnostic](benchmarks/2026-11-05-local-nfr-diagnostic.json) | All identities signed in; failed SSE admission before measured workload | 568 attempts; admission p95 **22,685 ms** across 471 timing samples |
| [Eight-user smoke retry](benchmarks/2026-11-05-local-nfr-smoke-retry.json) | 8/8 writes, 16/16 deliveries, zero errors | Read p95 **4,700 ms**, delivery upper-bound p95 **4,845 ms** |
| [Eight-user phase profile](benchmarks/2026-11-05-local-nfr-phase-profile.json) | 8/8 writes, 16/16 deliveries, zero errors | Read p95 **1,214 ms**, delivery upper-bound p95 **1,255 ms** |

Targets remain read p95 **750 ms**, delivery upper-bound p95 **2,000 ms**, and unexpected failures below **1%** under the specified sustained workload. Read latency still fails even in the last small smoke. No thresholds, admission limits or authentication checks were relaxed. The 100-user/1,000-write/15-minute acceptance gate is **not qualified**; successful smoke execution is not acceptance.

[Server phase observations](benchmarks/2026-11-05-server-phase-observations.json) show separate p95 distributions: live authentication **1,018 ms** (56 samples), profile resolution **74 ms** (24), membership read **56 ms** (24), Redis polling **25 ms** (152). Authentication was the slowest recorded phase. Do not add or subtract these percentiles, attribute an individual request from them, or conclude that RAM caused the failure. A host sample had about 6,030 MiB total and 536 MiB free memory; this is context, not causal proof.

The next release work is a controlled run on the intended deployment resources, with correlated request/Auth/database timings. Address measured dependency or resource bottlenecks without weakening authorization, then rerun the full unchanged acceptance workload. Hosted backup/restore, alerts and external OAuth/email/AI acceptance remain separate gates.

## Failed attempts and test boundaries

Earlier development-mode login attempts hit actual local Auth HTTP 504 request timeouts; production core acceptance subsequently passed. One extended attempt left one Auth fixture after its cleanup timed out; exact-identity recovery was verified. The original load failure did not recur in instrumented smoke retries, so its specific cause remains unresolved rather than being declared fixed.

Production settings testing exposed minified framework error text while the database correctly stayed at version 2. The safe-result repair then passed through conflict review and a version-3 save preserving the other tab's untouched field. A later navigation check had clicked before save/refresh completed; waiting for UI completion resolved it. Transient accessibility/focus failures were retained and the focused audit rerun after toast dismissal, without excluding its assertions. The final focused audit passed.

Raw local logs and harness adaptations are in `.local-test/qa-20261105-fixes/`; earlier red/green evidence also exists in `.local-test/qa-20261105/`. They are ignored local artifacts. The linked sanitized JSON, screenshots and this ledger are the portable summary; selected local harnesses contain host-specific paths and are not deployment scripts.

## Operational boundaries

Fixture cleanup was verified. The isolated Supabase stack, QA Redis and SQL test container are stopped; Supabase data volumes and downloaded images were retained. Ports 3101, 56321, 56322, 56379 and 55439 have no listeners.

No production deployment, hosted data mutation, external email, key rotation, or infrastructure policy change was performed. Backup restore, deployed revision/configuration, hosted worker/alert behavior, provider quality and sustained capacity require their own environment-specific evidence. Historical failed performance targets are not closed by unit tests or a small smoke run.

Tradeoff: shared invitation quota admission now occurs while holding the workspace transaction lock, preventing authorization changes between admission and insertion. Redis latency can extend that lock; measure this path under the supported workload.

Session draft storage is optional: unavailable storage leaves normal in-memory editing usable. It is scoped to the current tab and account; it is not a server-side backup and does not survive clearing browser storage.
