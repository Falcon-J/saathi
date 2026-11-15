# Platform closeout verification

Status: superseded by the [verified hosted release](2026-11-16-hosted-shipping.md). The local changes are now integrated, merged and deployed; all three hosted gaps and the integrated candidate's sustained acceptance passed. The source fingerprints, measurements and resource notes below retain the earlier closeout's historical scope.

Scope: canvas, shared domain commands, company/section access, MCP OAuth delegation and agent coordination in ADR 0002 and the November 12 release scope. Existing checkout changes and design assets are preserved. This closeout has not committed or pushed changes. Hosted activation redeployed the existing production commit, not this dirty checkout.

## Implemented changes

- Repaired the platform test command's nonexistent fixture entry and included the canvas/MCP regression suites.
- Connected workspace planning, advisor, CSV import, workspace tools and account navigation to existing actions/components. Search renders at most 50 matches while searching the full authorized graph.
- Added select/pan tools, drag selection, V/H/Space navigation, zoom/reset, fit canvas and fit selection. Canonical layout stays automatic; scoped view/camera preferences persist with agent following off and access rechecked.
- Isolated camera subscriptions and compact task rendering for the 750-task workflow.
- Persisted exact human-review and workspace-creation commands before dispatch, verified browser storage, restored unknown outcomes after reload, and preserved them through session/account changes. Server creation receipts cover manual and reviewed-plan tasks atomically; replay rechecks current access and never recreates deleted resources.
- Kept healthy outbox work scheduled across bounded four-batch callbacks. Dependency failures remain durable for the retry worker; delivery cannot change a committed command outcome.
- Corrected Redis SDK decoding and exclusive idle stream reads. Bounded raw stream snapshots share transport; completed authorization decisions are never cached and replay bounds share in-flight reads only.
- Reduced legacy task-read round trips without bypassing membership, section policy or transaction snapshots. Restored bounded local GoTrue connection reuse under exact project/container/config guards.

## Current evidence

Current root/native source: 543 files, SHA-256 a908c3e703d211fc0f54e5815bf0f5bc76d157e5317f5c84f449219bf9ccccac. Documentation and ignored diagnostics are separate.

| Check | Result | Local evidence |
| --- | --- | --- |
| npm test | 652 passed, 2 optional skips | .local-test/closeout-recovery-final-registry.log |
| npm run test:platform | 252 passed, zero failures | .local-test/closeout-recovery-final-checks.log |
| Lint and nonincremental TypeScript | Passed; one existing task-comments hook warning | .local-test/closeout-recovery-final-checks.log; .local-test/closeout-recovery-final-registry.log |
| Both database suites | Passed, including concurrent creation, exact replay, selected tasks, revocation/deletion, rollback and fixture absence | .local-test/closeout-recovery-database.log |
| Native production build | Passed | .local-test/closeout-recovery-linux-build.log |
| Windows production build | Passed | .local-test/closeout-recovery-windows-build.log |
| Isolated full capacity | Passed: 100 active identities, 1,000 durable writes/receipts/events, all 25,000 deliveries, zero errors/duplicates, 900,063ms measured; read p95 385ms, delivery p95 773ms | .local-test/nfr-e11700b7-75a3-4a28-8ff7-d399672758a5/result.json |
| Windows verifier shutdown guard | Four regressions passed; failed/live shutdown preserves fixtures | .local-test/closeout-windows-cleanup-green.log |
| Schema consistency | Passed | .local-test/closeout-recovery-schema-check.log |
| Public browser suite | 16 desktop/mobile tests passed | .local-test/closeout-recovery-e2e.log |
| Production Auth | Account/invitation/recovery/accessibility journeys and exact cleanup passed | .local-test/closeout-recovery-auth.log |
| Full canvas | Navigation, both review/creation lost-response recovery, permissions/references/revocation, camera restoration and exact cleanup passed | .local-test/ready-waiting-2ba19445-b785-4a68-908c-048fd43121af/results.json |
| Real MCP OAuth/agent lifecycle | Discovery, exact retry, concurrent claim, takeover fencing, review/evidence, refresh/revocation and exact cleanup passed | .local-test/mcp-oauth-ce8178ee194e/result.json |
| Redis outage and restore | Committed receipt/task/outbox recovery, restored row equality and exact cleanup passed | .local-test/operations-ff31d00e-12e1-4673-97c4-188b8035db53/result.json |

All current functional artifacts above include the creation/outbox fix. The passing isolated full capacity run used the same frozen root/native source, with no concurrent task tests, builds or browser work. Windows checks used bundled Node 24.22.1; native build/capacity used Node 22.18.0. The global Node installation was unchanged.

## Hosted activation — November 16

- Production deployment `dpl_HcQjjLzfcpHEHGb3ADVu61z6sh4K` is READY at `https://saathi-ten.vercel.app`, in Seoul (`icn1`) beside the existing Seoul database. It redeploys existing production commit `24e8314117792f8d15d29958268a7f8cf5eae4fa`; the local source fingerprint and capacity results above do not describe that deployed tree.
- Enabled Supabase OAuth at `/oauth/consent` with the existing canonical Site URL and dynamic registration disabled. Registered public client `001e171f-e684-4400-9e00-16294057e3c6` (Codex — Saathi), authentication method `none`, authorization-code/refresh grants and exact callback `http://127.0.0.1:56697/callback/3R-0Tz9upTcM`.
- Installed and activated `saathi_auth.mcp_access_token_hook` separately from migration history. Direct SQL assertions confirm the Codex audience changes while browser/unrelated-client audiences remain unchanged; Auth has schema/function permissions, browser roles cannot execute it, and it is SECURITY INVOKER. Attempting SET ROLE through the management connection was denied; that attempt is not evidence of execution as Auth. Public JWKS advertises ES256.
- Set production-only MCP resource, issuer, client/callback allowlists and enabled flag. Readiness and protected-resource metadata return 200; missing/malformed bearer credentials return 401 with the OAuth challenge; untrusted origins return 403. No error/fatal runtime log groups were reported for the new deployment.
- All 16 existing public desktop/mobile tests passed against the final Seoul deployment in 44.6 seconds. Fresh browser password sign-in also passed with the active audience hook. A form loaded before the deployment switch produced a generic error; reloading the form and signing in succeeded.
- Real public-client PKCE exchange, ES256 signature verification, dedicated audience, initialization, tool discovery and refresh passed. An empty workspace grant denied workspace access. Disconnect denied the old access token, denied refresh and left zero provider sessions for the client. Final Codex CLI login succeeded after that revocation test.
- The user approved read and edit-work access only to `Saathi temporary invitation QA` for one hour, ending `2026-11-15T21:38:34.457Z` (November 16, 03:08 IST). Destructive operations, access management and other/future workspaces stayed disabled. The real delegation matched those settings; discovery exposed 32 tools, excluding destructive and human-review operations. Scoped reads succeeded and an outside-workspace request was denied.
- Task creation and exact retry returned one durable task/receipt; changing the payload with the same command ID failed. Stale task versions failed. Concurrent agent claims produced one winner; exact claim retry replayed it. Lease expiry, fenced takeover and stale-worker rejection passed. Evidence submission reached awaiting review while the task stayed todo; no agent completed human approval.
- Temporarily forcing this exact delegation's expiry denied MCP access. Its original expiry was restored immediately afterward. This verifies expiry enforcement, not an unattended one-hour clock test. Normal revocation/provider cleanup passed; injected cleanup failure remains a local-only check.
- Initial Virginia requests took approximately 7–10 seconds. Moving the production function default region to Seoul reduced three task-read samples to 2,381/814/1,011ms, a write to 1,406ms and its retry to 736ms. These small functional samples are not a hosted capacity benchmark.
- All ten fixture events were published. Exact cleanup removed two tasks, two agent runs, one lease, one comment, ten activity/outbox pairs, eight platform receipts and two legacy receipts. A final consolidated SQL query found zero remaining owned fixture rows across those tables and confirmed the original workspace remains. Published Redis stream entries retain their normal TTL; the existing stream was not deleted.
- Sanitized activation checkpoint: `.local-test/hosted-activation-2026-11-16.json`; final public suite: `.local-test/hosted-auth-seoul-final-2026-11-16.log`; fixture manifest: `.local-test/hosted-mcp-cleanup-manifest.json`. Temporary callback servers and test processes are closed. Codex retains its normal secure-store credentials within the bounded delegation.

## Hosted gates closed by the integrated release

- Non-owner membership removal passed with a disposable member and the actual owner browser UI; the old MCP token immediately lost access.
- Real ordinary-browser and unrelated registered-client PKCE tokens were rejected by hosted MCP.
- A narrowly scoped hosted provider-cleanup outage preserved application revocation; reload/retry removed provider sessions and denied refresh. The release contains no fault injector.
- The local source was integrated with current production, verified, merged through PR26 and deployed. See the [shipping report](2026-11-16-hosted-shipping.md) for exact revisions, current checks and cleanup. The original user's one-hour consent was never extended.
- Security advisory review still reports leaked-password protection disabled (warning); deny-by-default RLS tables also produce informational notices. No claim of a clean security-advisor report is made. Connection instructions remain in [MCP activation](../operations/mcp-activation.md).

## Capacity investigation

Targets remain read p95 <=750ms, dispatch-to-delivery upper-bound p95 <=2,000ms, and unexpected failures <1%. Timing semantics version 2 uses the same generator's monotonic dispatch and receipt clock, conservatively including Auth, request and SQL work. Historical wall-clock delivery figures are not directly comparable.

| Run | Scope | Result |
| --- | --- | --- |
| 21e72919 | Full, after local Auth pool fix | Failed after 372 writes; read p95 5,517ms and later write timeouts. Cleanup passed. |
| 8aef61ec | 20 identities, 100 streams, 200 writes | All 5,000 deliveries; read p95 778ms and delivery 2,279ms failed targets. |
| cae3cbe4 | Same diagnostic, legacy SQL improvement | All deliveries; read p95 1,905ms and delivery 5,376ms failed targets. |
| e1152c95 | Same diagnostic, bounded raw stream coalescing | All 200 writes and 5,000 deliveries; read p95 428ms, delivery 925ms, zero errors/duplicates and exact cleanup. Diagnostic only. |
| 283a67b9 | Full, pre-creation/outbox fix | All 1,000 write responses; read p95 5,694ms, delivery 18,461ms, 24,875/25,000 deliveries. No request errors/duplicates; cleanup passed. Failed gate. |
| e11700b7 | Final isolated full acceptance, current source | Passed all targets: 1,000 durable writes, 25,000 deliveries, read p95 385ms, delivery p95 773ms, zero errors/duplicates and exact cleanup. |

The last full attempt overlapped focused Windows tests on the same 6GB host. Slow windows correlate with those tests, so it is not a passing isolated capacity measurement. Server logs contain 995 task publications, matching 995 unique observed events. A regression independently reproduced healthy pending outbox work being stranded at the four-batch limit. The bounded handoff fix passed 11 unit tests, including late commits, saturated batches, eventual idle termination and failure behavior. The final isolated current-source run e11700b7 subsequently passed all unchanged targets: 100 active identities, 1,000 durable events and receipts, all 25,000 notifications, no missing/duplicate notifications or request errors, read p95 385ms and dispatch-to-delivery p95 773ms. All 100 observers connected four times, exercising automatic replay/reconnect. Exact fixture cleanup passed.

Full failed-run evidence is .local-test/nfr-283a67b9-7aa3-43ff-bcd8-2904c7461819/{result.json,revision.json,timings.jsonl,publication-summary.json}. Earlier failures remain troubleshooting evidence.

## Measurement limits

The current full canvas profile used 750 real tasks, a foreground focused Chrome tab and 4x CPU slowdown: input p95 131ms, frame p95 36ms, maximum frame gap 662ms. The full artifact also records load-to-search 11,435ms and task-editor automation roundtrip 14,757ms under the same 4x profile. Earlier full/isolated runs recorded 92/35/1,413ms and 74/19/391ms respectively. The isolated diagnostic skipped baseline handoff phases and does not replace full acceptance; earlier maximum gaps are retained. Input measurement ends after a matching option is visible and two animation frames, measuring a paint opportunity. Full canvas acceptance exercised desktop/mobile reload and retained opt-in agent following.

The current MCP sample timed 24 actual HTTP requests including live Auth/current SQL authorization and excluding external inference. First authenticated request was 245ms; 17 HTTP-success tool calls had median 335ms and p95 756ms. Five authentication/delegation denials were verified separately. This is functional evidence, not sustained MCP capacity.

## Local Auth configuration

GoTrue v2.197.0 started with zero idle/open pool limits and accumulated 3,284 PostgreSQL TIME_WAIT sockets, matching [upstream issue 2831](https://github.com/supabase/auth/issues/2831). The nonsecret local configuration restores ten open/ten idle connections. Its helper pins the project/container/image/network/DB route, preserves foreign configuration, installs without overwrite, checks fresh effective limits/health, and reconciles lost install responses with inode/hash-guarded rollback. It may restart only the named disposable Auth container. Hosted settings, application pool size and Auth quotas are unchanged.

The identical direct real-Auth probe changed concurrency-25 p95 from 2,165ms to 172ms; exact probe cleanup passed. Local/CI preparation regressions cover configuration ownership and recovery. Capacity uses Supabase CLI 2.120.0, GoTrue v2.197.0, PostgreSQL public.ecr.aws/supabase/postgres:17.11.0.004, Redis 7 and native Linux Node 22.18.0 under the existing 2GB/four-processor WSL limit. These measurements are not a hosted capacity guarantee.

## Hosted access

The owning Vercel connection now accesses [Saathi's project](https://vercel.com/omkarjawalikar04-gmailcoms-projects/saathi). The owner Chrome session also accessed the correct Supabase organization. The earlier account-access blocker is resolved. Production-only MCP configuration and the function region changed as recorded above; existing secrets were not retrieved or replaced.

## Final resource cleanup

The exact task-created PostgreSQL and Redis containers and their exclusive anonymous volumes were removed after fixture absence and ownership checks. The original four QA services remain running and healthy. Sanitized native run evidence was copied into .local-test before the two owned native checkouts and temporary runtime tools were removed. Resource proof is .local-test/final-resource-cleanup.json; the passing run also has a standalone report.html. The worktree source fingerprint still matches the passing run.
