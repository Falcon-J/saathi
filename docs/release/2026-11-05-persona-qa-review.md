# Saathi persona QA and readiness review

Review date: 5 November 2026 (Asia/Calcutta). Source baseline: `41ef5c34b83fef7c6da2a04bf385a0b39f01dd3a` on `main`.

This is the pre-fix audit. See the [remediation ledger](2026-11-05-review-remediation.md) for subsequent code changes and fresh verification; retain this document as the original evidence rather than interpreting its findings as the current fix status.

## Decision

**Do not call this release ready for unrestricted use yet.** The core collaboration architecture is substantial, but focused executable reproductions found four correctness/security defects. A clean automated suite and authenticated multi-persona browser acceptance must also pass. This review does not claim exhaustive testing or production capacity.

No application behavior, hosted data, credentials, deployment, or schema source was changed in this audit. Existing migrations were applied only to disposable local databases. Fixes below are recommendations, not shipped changes. Test personas are synthetic; no real customer data is needed.

## Evidence vocabulary

- **Observed browser:** executed in an actual browser against the named environment.
- **Reproduced harness:** executed actual application modules with explicitly mocked infrastructure or React state. This establishes the stated control-flow defect, not a full browser/database journey.
- **Source finding:** traced in current code; its browser scenario still requires execution.
- **Historical:** previously recorded evidence, not rerun today.
- **Blocked:** not verified because a named prerequisite is unavailable. A blocked or skipped check is not a pass.

The local raw evidence directory is `.local-test/qa-20261105/` (ignored by Git). It contains command logs, diagnostic scripts and public-browser screenshots. The portable reproduction instructions below distinguish successful reproduction of a bug from a passing product acceptance test.

A sanitized, portable [JSON evidence summary](2026-11-05-qa-evidence.json) preserves the source revision, counts, public checks and reproduction outputs alongside this report.

## Persona coverage

| Persona | Required journey | Existing automated entry point | Audit coverage boundary |
| --- | --- | --- | --- |
| Anonymous visitor | Understand product, navigate public pages, protected redirect | `tests/e2e/auth-ui.spec.ts` | Public-browser pass recorded separately below |
| New account | Register, verify email, first workspace, recovery | Public auth UI tests; `scripts/verify-local-auth.mjs` seeds confirmed accounts | Confirmed fixtures do not prove signup email, OAuth, or recovery delivery |
| Workspace owner | Create workspace/tasks, assign, invite, metadata, archive/delete | `scripts/verify-local-auth.mjs`; workspace/database tests | Settings concurrency reproduced in component harness; signed-in browser run requires local services |
| Task creator/member | Create/edit permitted tasks, comment, filters/import, conflict recovery | Collaboration/comment/task-page tests; signed-in runner | Source review plus full-suite result; browser coverage must be stated per journey |
| Assignee | Complete/reopen; cannot rewrite/delete someone else's task | `lib/task-permission.test.ts`; signed-in runner | Permission mechanism exists; live cross-account journey is separate |
| Intended invitee | Inbox, copied link, accept once, reload | Signed-in runner covers four independent accounts | Fresh local run depends on Auth/PostgreSQL |
| Outsider/wrong account | Guessed IDs, wrong-recipient link, forbidden usage | Signed-in runner and collaboration tests | Invitation quota abuse reproduced with actual actions/domain checks and mocked storage |
| Revoked member | Subsequent reads/writes/subscriptions denied | Collaboration/SSE authorization tests | Live revocation timing remains a separate acceptance check |
| Two concurrent editors | Stale draft conflict, no lost update | Task version tests; settings reproduction | Settings defect reproduced; task-edit mechanism is not equivalent evidence for settings |
| Interrupted/reconnecting client | Replay, duplicate events, history gap, recovery | Realtime helpers/hooks; SSE reproduction | Control-message handling defect reproduced; live transport acceptance remains necessary |
| Mobile/keyboard user | 360px layout, focus, forms, task edit recovery | Public Playwright + dedicated signed-in runner | Public observation cannot certify authenticated dashboard accessibility |
| Multi-workspace/timezone user | Retain context, accurate deadlines | Source review; targeted browser cases below | Existing signed-in fixture has one workspace and does not cover these cases |
| AI user | Authorized facts, disabled/provider failure, reviewed persistence | AI unit/service tests, `verify:groq` | No live-provider quality claim follows from mocks or source review |
| Operator | Outbox retry, health, quotas, restore, rollback | Redis/lease/NFR verifiers; release records | Hosted schedule and recovery acceptance are deployment-specific |

## Confirmed defects

Severity reflects consequence, not proof of production incidence. P1 should be fixed before widening use; P2 should be fixed or explicitly accepted for a bounded beta.

### QA-01 — P1 — SSE control messages are discarded as duplicates

**Evidence:** reproduced harness using actual `hooks/useRealtime.ts` and `lib/realtime-sse.ts`. Client location: `hooks/useRealtime.ts:97`; idless server control messages: `app/api/realtime/route.ts`.

1. Open a stream and receive a task event with `id: 100-0`.
2. Receive a heartbeat, `resync-required`, or error without a new `id` field.
3. EventSource retains the previous ID, so each message has `lastEventId === '100-0'`.
4. The hook deduplicates before parsing message type and drops all three.

**Observed:** task callback runs once; resync callback remains at its initial-open count of one; active users stay empty; connection remains marked connected; error remains null. **Expected:** heartbeat updates presence, recovery triggers authoritative refresh, and error updates connection state.

An in-connection retention gap can therefore advance the server cursor without the required client reconciliation. Later reconnect/refresh may repair state; this is not a claim of permanent divergence. The [WHATWG SSE specification](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation) defines inherited event IDs. A separate native Chrome/loopback HTTP probe confirmed that all three idless control messages received `lastEventId: 100-0`; these were actual browser `MessageEvent` objects, not mocks. The combined evidence verifies the protocol assumption and the hook defect separately.

**Minimal repair:** parse and validate the event envelope before applying domain-notification deduplication; control messages must remain actionable. Test the actual helper together with the hook and a native EventSource fixture. Existing hook tests that replace `shouldProcessEvent` with an always-true stub do not cover this integration.

### QA-02 — P2 — Workspace settings pair an old draft with a new version

**Evidence:** reproduced actual `WorkspaceSettings` component with retained React state and simulated prop refresh. Locations: `components/workspace-settings.tsx:11`, `:26`; `app/dashboard/page.tsx:432`; `lib/data/workspaces.ts:128`.

1. Owner tab A opens version 1 and starts a draft.
2. Owner tab B updates the workspace to version 2.
3. Tab A receives refreshed props without remounting its same-workspace form.
4. Tab A submits local version-1 fields with `workspace.version === 2`.

**Observed harness submission:** old summary `Original goal` and old target `2026-11-10` accompany expected version 2 despite incoming props containing `Remote updated goal` and target `2026-12-20`. The component calls its saved callback.

The database checks the supplied version, so this combination can silently overwrite tab B. The harness proves the malformed command; actual browser delivery and database overwrite were not part of that harness.

**Minimal repair:** capture draft fields and their base version together. Update both on an explicit reload/rebase, or reconcile only pristine forms. Preserve unsaved input on conflict.

### QA-03 — P2 — Generic rate limiting overwrites concurrent counts

**Evidence:** deterministic execution of actual `lib/rate-limit.ts:29` with controlled Redis interleaving.

For a limit of two, request A increments to 1; B increments to 2; A sets the key to 1 to attach expiry; C increments to 2. **All three are accepted.** The counter was reset, not merely expired.

**Minimal repair:** make increment plus first-use expiry atomic without overwriting other increments. Verify the same interleaving, expiry, boundary behavior and dependency failures. The SSE connection-lease implementation already uses an atomic mechanism; this finding concerns the generic limiter.

### QA-04 — P2 — Unauthorized invitation attempts exhaust recipient quota

**Evidence:** actual invitation action and actual domain ownership check with mocked SQL/Redis. Locations: `app/actions/invitations.ts:14`; `lib/data/invitations.ts:33`.

An authenticated outsider makes five invitation attempts against an unauthorized/nonexistent workspace for a target email. Each domain operation rejects ownership, but the recipient's shared quota has already been charged. A legitimate owner then receives `Rate limit exceeded` before reaching the domain operation.

**Minimal repair:** retain attacker-scoped admission first, establish authorized workspace/recipient scope before consuming shared quotas, and retain transactional authorization rechecks. Prove rejected unauthorized requests cannot drain another user's quota.

## UI and UX findings requiring browser follow-through

| ID | Priority | Source-backed issue and reproduction | Smallest useful improvement |
| --- | --- | --- | --- |
| UX-01 | P2 | Initial task read fails, but dashboard still renders Overview with empty tasks and reassuring zero-work/all-clear statements. Inspect `hooks/use-workspaces.ts:184`, `app/dashboard/page.tsx:438`, `components/workspace-overview.tsx:108`. | Gate progress/empty claims on successful data reads; label retained stale results and offer retry |
| UX-02 | P2 | Browser-local deadline input/editor and workspace-timezone cards display different unnamed clock times. Test Asia/Kolkata browser against UTC workspace. See `lib/task-time.ts:46`, `lib/task-draft.ts:32`. | State the timezone and use a consistent editing/display contract without changing stored instants |
| UX-03 | P2 | Select workspace B then reload; initial selection returns to first workspace. Invitation acceptance does not explicitly select the newly joined workspace. See `hooks/use-workspaces.ts:149`, invitation response/inbox components. | Preserve validated workspace identity in navigation and land on the accepted workspace |
| UX-04 | P2 | Overview → Board → Team replaces history entries, preventing Back from retracing views. See `app/dashboard/page.tsx:233`. | Use navigable history for intentional view changes and restore Back/Forward state |
| UX-05 | P2 | Ready/Waiting renders a whole graph before another Today/Next/Completed representation and quick-add. Large workspaces amplify repetition and push action down on mobile. | Keep one primary task surface; bound the readiness summary or make it a dedicated view; put prerequisite controls in task details |
| UX-06 | P2 | Settings and quick-add local drafts disappear when their conditional panel unmounts during navigation. | Retain drafts per workspace or provide dirty-navigation protection |
| UX-07 | P2 | Task conflict guidance tells users to copy the draft, close and reopen; there is no integrated reload/review action. See `components/task-list.tsx:549`. | Preserve draft while displaying current server state and offering explicit review |

Lower-priority follow-ups: consolidate duplicate title/pencil edit controls and completion/status controls; collapse an empty invitation inbox without hiding real invitations; use visible invitation-action wording consistent with copied links rather than email delivery; explain leave/remove consequences. Test long uninterrupted titles, keyboard panel transitions and focus restoration before claiming a defect.

**Why the UI feels complicated:** it presents multiple overlapping work classifications at once, repeats editing controls, and makes users manually recover context after navigation/errors. The backend's consistency mechanisms are justified; exposing several competing task surfaces is a separate product choice. Simplification should preserve permissions, labels, recovery guidance and destructive-action consequences.

## Engineering assessment

| Perspective | Strength | Remaining concern |
| --- | --- | --- |
| Architecture | Modular monolith with clear durable/ephemeral ownership | Avoid adding services without measured need |
| Data correctness | Transactions, foreign keys, ownership/assignment constraints, consistent lock order | Client draft version must correspond to the fields actually edited |
| Security | Live identity checks, membership scoping, recipient binding | Shared quota ownership bug; deployed configuration is a separate review |
| Reliability | Durable outbox, receipts, replay and authoritative refresh | SSE protocol integration defect; fault-inject post-commit invitation revalidation |
| Performance | Board/activity/comment paging, bounded stream reads | Full Overview/graph projections and workspace-wide write serialization need measured limits |
| Testing | Extensive source/unit/database tests plus a dedicated signed-in runner | Mocked helpers can conceal integration bugs; standard public UI suite is not full platform coverage |
| Operations | Readiness/liveness, worker and retention paths | Fresh restore/rollback/alerting evidence and performance acceptance remain necessary |
| Developer experience | Lockfile, CI and study handbook | Reproducible Windows install/runtime and stale documentation need attention |

Activity continuation and Board pagination **are implemented**. This audit corrected handbook rows that still called them planned. The dedicated signed-in acceptance runner is broader than the standard auth-page Playwright suite, but its confirmed-user, single-workspace fixtures leave important journeys uncovered.

## Dependency security

`npm audit --omit=dev --json` exited 1 and reported **9 affected packages: 2 critical, 6 high, 1 moderate**. This is the registry's package-level assessment, not nine demonstrated exploitable application paths. Raw advisory details are retained in `.local-test/qa-20261105/dependency-audit.json`.

| Registry severity | Packages |
| --- | --- |
| Critical | `next`, `@auth/core` |
| High | `browserslist`, `nanoid`, `postcss`, `sharp`, `source-map-js`, `zod` |
| Moderate | `baseline-browser-mapping` |

Next.js is active in this application. Its installed `16.2.4` falls within the affected range for the [reviewed Server Components denial-of-service advisory](https://github.com/advisories/GHSA-8h8q-6873-q5fj), which lists `16.2.5` as its patch; later advisories require a broader current-version review rather than upgrading only to that first patch. The aggregate critical package rating includes other advisories and is not the severity of this single example.

`@auth/core` is declared but no import was found in `app`, `lib`, `hooks` or `components`; authentication uses Supabase. Verify whether it can be removed rather than assuming its advisories imply compromise of Saathi's current login path. Image optimization is configured off, so image-specific advisories also require reachability analysis. [Zod's oversized-collection advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) needs review of actual ingress limits and schemas; npm proposes a major-version change, which must be validated for compatibility.

Triage dependency reachability and upgrade/remove affected packages before wider release. No `npm audit fix`, package upgrade, or exploit traffic against production was performed.

## Performance and release boundaries

The [October 24 diagnostic](2026-10-24-performance-follow-up.md) remains historical evidence: all 100 writes and 2,500 expected deliveries were observed, but read p95 2,269 ms exceeded 750 ms and delivery upper-bound p95 2,396 ms exceeded 2,000 ms. These thresholds were not changed in this review. A small smoke test cannot close that gate.

The [limited-beta release record](2026-10-25-beta-release.md) records worker activation and dated hosted checks. It does not establish today's hosted health, latest feature acceptance, alert response, backup restore or sustained capacity.

## Exit criteria for wider use

1. Repair QA-01 through QA-04 with failing-then-passing regressions and review the fixes; triage and remediate reachable dependency advisories.
2. Clean Node 22 install; lint, types, unit suite, migration/database suite and production build all pass on the reviewed revision.
3. Execute isolated owner/member/invitee/outsider acceptance plus settings conflict, revocation, replay gap, multi-workspace navigation and timezone cases.
4. Complete authenticated desktop/mobile keyboard and accessibility checks at representative task counts.
5. Verify the intended deployed revision, configuration, outbox schedule, backlog alert, restore and rollback procedures.
6. Meet agreed performance targets in a controlled workload or explicitly narrow the supported beta scope; do not weaken authorization or relabel failed gates.

Study companion: [QA findings and system-design study guide](../interviews/saathi-qa-system-design-study-guide.md).

## Execution ledger

### Fresh completed checks

| Check | Result | Boundary |
| --- | --- | --- |
| Locked dependency install, Node 22.18.0 | Exit 0; 694 packages | Machine npm `os=linux` setting omitted Windows native optional packages; build repair is separate |
| `npm test` | 411 total; **409 pass, 0 fail, 2 skip** | Skips: operational AI metadata DB check and migration-journal local integration |
| `npm run lint` | Exit 0 | Repository lint, including added reproduction scripts |
| Normal type-check | Exit 2, missing five ambient type definitions | TypeScript discovers incomplete `C:/Users/ojade/node_modules/@types` outside this repo |
| Type-check with `--typeRoots ./node_modules/@types` | Exit 0 | Project types pass with ancestor ambient type discovery excluded; standard command remains environment-blocked |
| Three reproduction scripts | Exit 0; all four defects reproduced | Actual modules; mocked React/SQL/Redis as explicitly described |
| Native EventSource probe | Exit 0; ID inheritance confirmed | Actual Chrome, temporary loopback HTTP stream; no application Auth/DB |
| Production dependency audit | Exit 1; 9 affected packages | Package advisories, not exploitability certification |
| `npm run test:database` | Fresh retry exit 0: 55 passed, zero failures/skips across nine test files | Disposable PostgreSQL 16 on loopback port 55439; SQL identity stub and existing migrations applied successfully. Initial missing-URL attempt executed no tests. |
| `verify-local-redis.mjs` under Node 22 | Exit 0: 600/600 deliveries, outage recovery passed; p95 1,913 ms, 611 commands | Real disposable Redis through the local REST bridge; 200 consumers × three events, not authenticated HTTP SSE capacity |
| `verify-sse-leases.mjs` under Node 22 | Exit 0: 200 attempts, five admitted, 195 rejected; admission p95 397 ms | Retry identity, expiry, capacity, release and mixed TTLs passed. Disposable Redis container removed successfully. |
| Webpack production build, first attempt | Exit 1: missing Windows Lightning CSS binary | npm was configured for Linux on this Windows host |
| Webpack production build, native packages restored | Compiled successfully in 52 seconds, then exit 1 at TypeScript | Missing ancestor `body-parser` types; this is not a successful production build |
| Local public Playwright suite, first attempt | Server readiness timed out after 180 seconds; no test cases executed | Logs show proxy compilation at 64s and login compilation at 110s, without a completed login response |
| Local public Playwright suite, cached retry | **4 passed, 10 failed**, 9.9 minutes; exit 1 | Failed cases exhausted the test time budget; traces distinguish this from demonstrated incorrect UI assertions |

### Public deployed browser pass

Environment: `https://saathi-ten.vercel.app`; system Chrome through Playwright. The deployed source SHA was not established, so these observations are not attributed to the local revision.

Six routes (`/landing`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/dashboard`) were checked at **1440×1000 and 360×800**, totaling **12 cases**. All final pages returned HTTP 200, no case had horizontal overflow, and axe reported zero violations across all severities. This is not a blanket WCAG conformance claim.

Dashboard redirected to `/login?redirect=%2Fdashboard` at both widths. Login keyboard order and reveal/hide behavior passed. Reset without a valid recovery token displayed an unavailable-link state and recovery action. Desktop login and mobile landing/login/register/reset screenshots were visually inspected without a material layout defect. No registration, login, recovery email or other form was submitted; no accounts or messages were created.

Raw structured results: `.local-test/qa-20261105/public-ui/results.json`; twelve screenshots are adjacent.

Separate fresh read-only deployed boundary checks returned `/api/health/live` **200** with `status: ok`, `/api/health/ready` **200** with `status: ready`, unauthenticated `/api/usage` **401**, and unauthenticated `/api/realtime?workspaceId=<synthetic UUID>` **401**. This establishes current endpoint behavior and required-dependency readiness at the sampled time, not signed-in authorization coverage, performance or a deployment-SHA match.

### Original evidence and current regressions

From the repository root with installed dependencies:

```powershell
node scripts/qa-settings-repro.cjs
node scripts/qa-sse-repro.cjs
node scripts/qa-backend-repro.cjs
```

During the original audit these scripts asserted the defective behavior. **They have since been converted into intended-behavior regression checks: exit 0 now means the repaired behavior passed.** The original observations above remain historical evidence; consult the [remediation ledger](2026-11-05-review-remediation.md) for red/green results and current verification boundaries. Their underlying regressions are included in the normal unit suite.

Normal verification uses this repository's npm lockfile and existing scripts, despite generic template instructions naming Yarn. Node 22 matches CI. Recommended clean-host sequence: `npm ci` with npm OS matching the host, `npm run lint`, `npm run type-check -- --incremental false`, `npm test`, disposable database bootstrap/migrations plus `npm run test:database`, `npm run test:e2e`, `npm run verify:auth:local`, Redis/lease checks, and the build. The signed-in runner requires its configured isolated Supabase stack under `.local-test/supabase-acceptance`; a plain PostgreSQL container is not an Auth server. Do not run its migrations against production.

### Remaining environment and acceptance work

Docker was initially unavailable, but responded after the user's latest startup attempt. The isolated SQL fixture then passed all 55 database tests, including concurrency, authorization, revocation, and task dependencies. This SQL fixture uses an identity stub, not Supabase Auth; it does not establish signed-in browser behavior. Real Redis adapter and lease checks also passed as recorded above. **Not verified because local Auth startup stalled:** fresh persisted owner/member/invitee/outsider browser journeys, authenticated mobile accessibility, and live revocation/reconnect. Load acceptance remains unverified because a successful production build is unavailable on this host.

Live OAuth/email/recovery and AI provider quality, hosted operational recovery, and an authenticated production accessibility audit remain outside the executed scope.

The Windows-native repair restored the exact lockfile versions of `lightningcss-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`, `@esbuild/win32-x64` and `@next/swc-win32-x64-msvc`. Package archive SHA-512 values were checked against the committed lockfile before extraction into local `node_modules`. All direct installed dependency versions were compared with the lockfile afterward: zero mismatches. No global npm setting or dependency manifest/lockfile was changed. A normal future install must use the host OS, for example command-scoped `npm ci --os=win32` on this machine.

The first local public-browser timeout occurred during cold development compilation, not an authenticated request or browser assertion. A cached retry reached all 14 existing public tests using system Chrome, two workers and the unchanged 30-second test budget. Four mobile accessibility/layout cases passed; ten cases failed through time-budget exhaustion. Examined traces show 26–50 second navigations; focus, overflow and redirect assertions in several failing cases completed successfully after the budget was largely or entirely consumed. Forms appeared in the DOM for other timed-out navigations. This suite is not green, but those traces do not establish broken reveal controls, redirects or accessibility. The underlying local slowness was not diagnosed; do not use development startup/navigation timings as a production capacity benchmark. Failed traces are retained under `.local-test/qa-20261105/e2e-results/`.

A later host-memory sample during local service startup reported 5.89 GiB total visible RAM and only 0.09 GiB free, with Windows Memory Compression using approximately 3,328 MiB. This is evidence of severe host memory pressure and a plausible contributor to slow checks, not proof of the root cause of the earlier browser timeouts. Do not interpret these local timings as production performance.

Cleanup was verified: the completed SQL container was stopped; disposable Redis was removed; the stalled Supabase startup process tree was terminated and project-specific `supabase stop` exited 0. No containers for `saathi-qa-20261105` remained, its named database volume and downloaded images were retained, and port 3101 had no listener. The isolated Auth database contained zero users before shutdown. No explicit backup-completion message was observed, so retained volume data is not claimed as a tested backup.

An isolated Supabase project configuration was prepared under `.local-test/supabase-acceptance` with project ID `saathi-qa-20261105` and ports in the 56320–56329 range. After Docker recovered, its database became healthy and initialization advanced through serial image downloads. The attempt exceeded 20 minutes; the Storage image pull then showed no new log progress for over five minutes, with no confirmed registry error or database lock. Severe memory pressure was observed, but the exact stall cause remains unresolved. The bounded attempt was stopped instead of claiming authenticated acceptance. Zero live persona accounts were created and no signed-in browser cases ran. The prepared local runner uses installed system Chrome and a direct cached Supabase CLI executable; application assertions remain unchanged. Retry on a host with sufficient available memory, then record per-phase results and fixture cleanup.
