# Saathi hosted release verification

Release candidate: `ead4705fb49d49ea87ba229abbd4e71a30b88183`, integrated from production `24e8314117792f8d15d29958268a7f8cf5eae4fa` and local snapshot `bf486ab47c9dc618985cc2c127a70dad246edcd0`. PR: https://github.com/Falcon-J/saathi/pull/26. All required gates passed. PR26 merged as `9cd9ce1ca357ad8d65de439a2eb7153632464a7f`; its tree exactly matches the tested candidate.

Production: https://saathi-ten.vercel.app. Hosted MCP: https://saathi-ten.vercel.app/mcp.

## Delivered behavior

- Canvas select/pan tools, drag selection, V/H/Space navigation, zoom/reset, fit canvas/selection, and account-scoped focus/camera restoration. Responsive framing waits for the current projection and adopted node geometry. Workspace titles retain pointer and keyboard navigation while card bodies support selection.
- Planning/advisor, CSV import, workspace tools, account navigation and full authorized task search with at most 50 rendered matches. Existing server-scoped search, URL/history, dense/mobile readiness groups, draft safeguards, contextual creation and editor lifecycle remain integrated.
- Durable browser workspace creation saves the exact command before dispatch and recovers an unknown outcome after reload. Actor and current access checks protect replay; command receipts prevent duplicate creation.
- Bounded outbox continuation after four batches, Redis decoding and shared idle transport, and reduced legacy read round trips. Authorization remains live per request.
- The repaired platform test registry includes canvas/MCP and regression suites. Primary command disabled states retain contrast; shared hover styling passes the AA threshold.

## Three hosted gates

All three used disposable, task-owned accounts and records. The original human consent was never extended.

1. A real ordinary browser JWT and a real unrelated public OAuth client's PKCE token both received MCP HTTP 401. The allowlisted client succeeded with the dedicated resource audience.
2. A non-owner read succeeded before removal. The actual owner browser UI removed that member, its count changed to one, SQL membership became zero, and the member's existing MCP token immediately returned `forbidden`. Repeated against deployed `431131d`.
3. A narrowly bound temporary canary injected provider cleanup failure after application revocation. The old token and a newly refreshed provider token both received application denial, although provider refresh still worked. After reload, **Finish disconnecting** removed provider sessions; refresh returned 400 and MCP returned 401. The fault injector is absent from the release branch, the canary branch was deleted, and its exact synthetic actor no longer exists.

## Additional hosted evidence

- Production password login, camera restoration, mobile overflow and a real 751-task workspace passed. Same-file CSV import repeated twice produced one SQL task.
- A server-completed workspace response was deliberately lost. After the retry control became enabled, reload restored the same command; retry produced one workspace and one creation receipt.
- MCP task creation and exact replay returned one task/receipt; a changed payload using the same command ID was rejected. Concurrent agent claims had one winner. A later takeover incremented the fencing token to two; start, progress and evidence submission reached `awaiting_review`, with the task still `todo`.
- Production AI planning is enabled. A separate disposable account exercised the real deployed provider: a three-task suggested plan was reviewed and created, then the advisor drafted a fourth task that was created after a separate review. SQL confirmed four tasks, one plan-creation receipt and no pending events. Exact cleanup removed the additional account/workspace/tasks/receipts/AI-operation metadata and discarded its credentials.
- Readiness returned 200; protected-resource metadata returned the canonical resource and Supabase issuer; unauthenticated MCP returned 401 with an OAuth challenge, and a foreign Origin returned 403. The public desktop/mobile suite passed 16 checks. No error/fatal groups appeared in the sampled deployment runtime logs.

## Verification

Final candidate local core: 681 passed, two optional skips. Platform: 352 passed. Final candidate general CI passed, including both database suites (63 and 58 checks), nonincremental TypeScript, lint, 16 public E2E checks and the production build. Lint retains one pre-existing task-comments dependency warning.

Final candidate authenticated desktop/mobile CI passed, including scoped search, URL/history, drafts, dense mobile geometry, current access revocation, context creation and review. Its exact fixture cleanup passed. The unchanged sustained gate also passed. Merged-main production deployment `dpl_7DvRpg2GxXExscLPDZxU7cpw87oc` is READY; its final canonical probe is recorded in the ignored release checkpoint.

Independent source review found no important or critical issues. Its focused run passed 138 tests; the final hover-contrast delta passed independent review and four design-token tests.

## Sustained acceptance

Run `f8c59267-6881-4b45-987d-5e601e8d3e13` completed 900,049ms with 100 active identities, 1,000 writes/events/receipts and all 25,000 deliveries. Read p95 was 15ms against 750ms; dispatch-to-delivery p95 was 563ms against 2,000ms. There were zero request errors, missing deliveries or duplicates. All 100 observers connected four times, exercising normal SSE rotation. Every performance target and exact fixture cleanup passed; no timing samples were dropped.

[General CI](https://github.com/Falcon-J/saathi/actions/runs/43769426323), [authenticated canvas CI](https://github.com/Falcon-J/saathi/actions/runs/43769426414), [sustained acceptance](https://github.com/Falcon-J/saathi/actions/runs/43769426410). The capacity artifact records source hash `cc572e2a2f5cd59d8d7d56c9886b5acb1cb29c12651afed8db07de228c48e3f0`, 567 source files and a clean working diff. Its tested PR merge commit `92bdac0` and final code merge `9cd9ce1` share tree `2a8a46042fbcaee56fca12bf206d048cec3f1058`.

## Configuration and cleanup

Supabase project `uccncldirwhlyrhxwbwt` has migrations through `canvas_access_0013`. OAuth uses the permanent public Codex client, exact loopback callback, PKCE, dynamic registration disabled and a client-specific audience hook. Production functions use Seoul `icn1`. Existing secrets were not retrieved or replaced.

Exact cleanup removed three disposable Auth accounts/profiles, six workspaces, the unrelated OAuth client, tasks, runs, leases, activity, outbox, delegations, sessions, AI-operation metadata and both receipt types. Consolidated SQL found zero remaining fixture rows, while preserving the original QA workspace and permanent client. All fixture events were published before deletion; Redis entries retain their normal TTL. The separate local fixture database was dropped after verifying no active connections. The original four QA containers remain running. Disposable fixture credentials were discarded.

The original user checkout, uncommitted changes and design assets remain preserved. Source integration and release work occurred in an isolated managed worktree.

## Evidence limits

The previous closeout's capacity result belongs to its frozen local source; it does not substitute for this integrated candidate's gate. Functional hosted latency samples are not a sustained hosted capacity guarantee. AI planning remains feature-flagged and its enabled production path was exercised; hosted MCP agents use their own model provider. The existing Supabase leaked-password-protection warning is not represented as a clean security-advisor result.

Sanitized detailed artifacts are preserved in the original workspace under `.local-test/shipping-2026-11-16-d1b92764`, including `hosted-remaining-checks.json`, `hosted-release-fixtures.json`, `hosted-final-probe.json`, the hosted browser logs/screenshots and CI artifacts.
