# Saathi Core Simplification and Human UX Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for implementation. Use superpowers:subagent-driven-development when independent work is explicitly delegated. Steps use checkbox (`- [ ]`) syntax. Read this plan and its referenced baseline before changing code.

**Goal:** Reduce application-owned plumbing and make everyday team work easy to understand, while closing the existing core acceptance gaps.

**Architecture:** Retain the modular monolith, PostgreSQL authority, transactional domain rules and outbox, Supabase identity, and Redis/SSE notification transport. Reuse the existing Radix/shadcn UI. Trial one client query owner for Board before extending it to other reads. Drafts belong to forms; persisted data belongs to server queries; permissions belong to server commands.

**Tech Stack:** Current Next.js/React/TypeScript, Tailwind, Radix/shadcn, Supabase/PostgreSQL, Postgres.js, Drizzle schema/migrations, Zod, React Hook Form, Redis/SSE and Node tests. TanStack Query is a conditional runtime addition. Playwright and axe are proposed test dependencies.

**Spec:** `../specs/2026-10-04-saathi-v1-engineering-baseline-design.md`, supplemented by the product brief and decisions in this plan. Research: `../../architecture/2026-10-05-stack-practices-research.md`. Current gaps: `../../architecture/2026-10-05-remaining-work-and-stack-review.md`.

**Status:** Consolidated plan for review. No task below is claimed implemented by writing this document. Prior delivered capabilities are retained, not rebuilt. This plan governs this continuation; historical plans and evidence remain historical records. It does not replace approved domain requirements.

## Product brief and approach

User intent: fewer mistakes and less bespoke code, with a UI that competes through clarity and ease of use. Working audience assumption: workspace owners and members coordinating everyday work, including people unfamiliar with project management tools. If the intended audience is large enterprise workflow administrators, revisit this brief before adding that scope.

Primary journey: **choose a workspace → see what needs attention → add or complete work → open details when needed**. Secondary journeys: assign and discuss work, invite people, inspect history, and manage a workspace safely.

Selected approach: incremental replacement and deletion behind existing contracts. A cleanup-only approach would leave repeated request lifecycles intact. A full framework or design-system rewrite would repeat verification work and increase regression risk. The selected approach keeps usable checkpoints and measures every replacement.

“More human friendly than Jira” is a testable product hypothesis, not a claim based on screenshots. Evaluate comparable basic journeys with unfamiliar users. Keep our own language and visual identity; use public licensed tools where appropriate.

## Global constraints

- Keep Overview → Board. Primary navigation is Overview, Board, Team. Activity and owner Settings are in the workspace menu; Ask Saathi is contextual and hidden when disabled.
- Preserve all approved task planning fields, role rules, comments, invitations, CSV behavior, history, archives and ownership transitions.
- PostgreSQL remains authoritative. Preserve transaction atomicity, optimistic versions, durable command receipts, retries and outbox obligations.
- Check authorization on every protected read, action, page and subscription. UI visibility and query keys are not authorization.
- Preserve expected-version conflicts and unknown mutation outcomes. Never silently rebase a retained draft or blindly repeat a non-idempotent write.
- Existing resources are test-only as authorized. Delete only fixture-owned records; never reset shared data to make tests pass.
- Preserve unrelated README, architecture, handbook and interview changes. Do not discard or stage them implicitly.
- No commit, push, deployment or production mutation without explicit authorization. Commit suggestions below are review boundaries, not authorization.
- Do not print credentials, cookies, tokens, raw AI context or full provider environments.
- Add a dependency only with a supported license, concrete replacement, measured cost and upgrade owner. Do not adopt all researched tools at once.
- Preserve current SQL. Do not migrate it to an ORM or increase pool size merely for uniformity.
- AI expansion, guided onboarding, custom workflow builders, hierarchy, attachments, reporting suites and drag and drop are outside this execution scope.
- Performance acceptance: 100 concurrent authenticated users, <=25 members and <=1000 tasks per tested workspace; warm task API p95 <=750ms; durable commit-to-observer p95 <=2s; unexpected failures <1%; run >=15 minutes with >=1000 measured operations/events.
- Revocation <=30s for active streams; authoritative reconciliation <=5s after healthy reconnect. Usable at 360px, keyboard-complete journeys, visible focus and labels. Proposed recovery objectives remain RPO <=24h and RTO <=4h.

## Definition of simplification

Record a baseline and final scoreboard in `docs/release/2026-10-05-simplification-scoreboard.md`:

| Measure | Acceptance rule |
| --- | --- |
| Owned code | Aggregate production LOC for all replacement scopes decreases. Count new adapters, providers and wrappers; moving code to another file is not deletion. Exclude tests, lockfiles and documentation; report added functional work separately. |
| Custom request lifecycle | Proposed adoption gate: >=25% reduction in manually maintained paging/loading/retry/invalidation logic within the Board replacement scope, with equivalent behavior. Freeze the file manifest before measurement. If the library misses this gate, remove the trial and retain the simpler implementation. |
| Duplicate owners | No task records simultaneously owned by a query cache, Zustand store and another hook. No old/new query implementation both shipped. |
| Dependencies | Remove confirmed unused packages; measure bundle impact rather than treating a dependency count alone as cost. A library addition must remove a named custom mechanism. |
| Requests and latency | Equivalent workflows must not increase unnecessary requests. Report production bundle bytes, request counts and timing before/after on the same fixture and build mode. Accept a bundle increase only with an explicit recorded tradeoff. |
| UX | Clear location, one primary action, no misleading empty/loading/success states; draft retention and recovery remain intact. |
| Verification | Existing domain checks pass; new rendered acceptance covers the behavior the replacement owns. |

The percentage is a proposed adoption threshold, not a promised whole-repository reduction. Activity pagination and tests may add necessary code; report that separately so useful features do not hide failed simplification. Never remove safety checks or tests to improve the scoreboard.

## Human UX contract

| Surface | Intended behavior | Acceptance |
| --- | --- | --- |
| Header/navigation | Workspace selector, New task, profile; secondary actions in existing menus | Highlighted view, rendered content and refresh/deep-link destination agree. Every current role can discover its actions. |
| Overview | One compact summary, quick add, work needing attention; completed work collapsed | No repeated workspace heading, competing mode switch or false zero totals while loading. Member read access does not depend on edit permission. |
| Quick add | Title + Add; Add details exposes optional fields | Enter submits once; busy and success states announced; response uncertainty keeps a recoverable draft. |
| Board | Tasks dominate. Default cards show title, status, and only useful priority/assignee/deadline cues | Remove repeated per-card metadata captions and always-visible edit/delete/assignment controls. Open details for deliberate editing; overflow actions remain reachable and labelled. Keep direct completion and existing status movement discoverable. |
| Filters | Search and a compact filter entry, with active selections visible and a clear reset | Every existing status/priority/assignee filter remains available. Search covers the server result set. Counts explicitly describe workspace totals, not filtered matches. Show “Showing 1 task” correctly. |
| Task details | Same accessible surface for owner and member, editable according to permissions; comments readable for members | Opens any authorized task, even outside the loaded page. Draft does not reset on realtime refresh. Reopening after conflict deliberately loads current data. |
| Team/activity | Clear roles and invitations; history has Load older activity | Long identities/content wrap at 360px. Loading is distinct from empty. Read errors offer Retry; successful mutation history remains durable. |
| Feedback | Plain words, relevant recovery action; inline form errors and global service status have distinct purposes | No raw SQL/provider terms. Never tell a user a save failed solely because its follow-up read failed. |

Use existing Button, Dialog, DropdownMenu, form fields and CSS tokens. Do not create a new generic component framework. Use a small shared component only when two actual callers need the same behavior. Preserve task field discoverability while reducing default card controls. Archive/delete/transfer retain consequence explanations and current safeguards.

## Review focus

1. Account/workspace switch during a pending read: no prior actor's records or late errors appear in the new scope. Owned by Tasks 2 and 5.
2. Concurrent edit and lost write response: retain draft, reject stale version, distinguish unknown outcome and avoid duplicate create. Owned by Tasks 2, 4 and 5.
3. Filter change while paging or realtime invalidation arrives: no stale append, duplicate row, wrong count or page request loop. Owned by Task 2.
4. Membership removal between pages and on an open stream: the next protected read fails and delivery stops within the target. Owned by Tasks 3 and 6.
5. Unfamiliar member on a small screen or keyboard: read/comment remains usable, optional details remain discoverable and errors give a next action. Owned by Tasks 4 and 5.

## Current baseline: retain this work

Recorded October 5 checks: 246 tests, 244 passed, two skipped; TypeScript, lint and production build passed. Board supports server pages of 50, whole-workspace aggregates and authorized by-ID detail reads; Board and comments had 137-record acceptance fixtures. The migration journal was reconciled against an exact reference catalog. Published outbox retention is implemented but its hosted scheduler is not proven operational.

Latest short real Redis run: 20 distinct users, 100 connections, 500/500 synthetic deliveries, delivery p95 1007ms. This is not 100-user sustained acceptance or durable command latency. Profile resolution p95 was 2229ms versus auth lookup 255ms in that sample. These are recorded results to refresh at execution, not new measurements from plan creation.

## Task 0: Establish and review the visual quality direction

This checkpoint precedes product implementation. Functional simplification does not establish visual quality. The user explicitly considers the current UI below the desired standard; the preceding UX fixes are retained correctness work, not a finished design.

**Files:** create `docs/design/2026-10-05-human-ui-direction.md`; isolated review prototype outside application routes; inspect `app/globals.css`, `lib/saathi-design.ts`, `components/workspace-create-form.tsx`, `components/workspace-overview.tsx`, `components/task-list.tsx`, `components/task-filter.tsx`, `components/member-manager.tsx` and task detail content in `components/task-list.tsx`. The prototype is disposable and must not become a second production implementation.

**Current confirmed finding:** October 5 Chrome creation screen and `workspace-create-form.tsx` show a prominent AI panel even when `aiEnabled` is false. The plan must hide unavailable AI promotion and reclaim its layout space. Do not describe the full interface as freshly audited from this one screen; inventory Overview, Board, Team and details separately.

- [ ] Capture desktop and 360px screens for creation, empty/populated Overview, populated/filtered Board, Team and task details. Record hierarchy, spacing, type, contrast, density, action discoverability, focus and state issues per surface. Use realistic short/long content and owner/member roles.
- [ ] Present two restrained visual treatments of the same Overview and Board content: a calm editorial layout and a compact workspace layout. Both retain the agreed navigation and full workflow. Recommend the treatment with better reading order and task discovery; do not add functionality merely to make a mockup attractive.
- [ ] Define one Saathi visual vocabulary using existing tokens: three text roles (page title, section title, body/meta), consistent spacing steps, one main accent, clear status semantics, restrained surfaces, and consistent control dimensions. Reserve borders, shadows and containers for actual grouping. Avoid nesting every block in a card.
- [ ] Prototype the selected treatment across Overview, Board, task details and workspace creation, including empty, loading, error, conflict, disabled and read-only states. Show realistic work, not a dashboard full of decorative statistics. Hide the creation AI panel when disabled; when enabled it remains a secondary optional action.
- [ ] Demonstrate keyboard focus order, title-first creation, task reading/completion and a member's read/comment journey. On mobile, preserve readable titles and useful actions without shrinking controls to fit desktop composition.
- [ ] Review the prototype with the user before applying its visual decisions to product code. Record accepted layout/type/spacing decisions in the design file. Resolve material navigation/action disagreements at this checkpoint; do not implement a rejected treatment and polish it later.

**Visual acceptance:** workspace/view identity and next action are apparent; reading order does not depend on decoration; task content receives more emphasis than chrome; metadata is legible; spacing has consistent rhythm; active, hover, focus, disabled and pending states are distinguishable; no horizontal overflow at 360px; unavailable features do not occupy primary space. These are proposed design criteria, with comparative superiority still requiring human evidence in Task 7.

**Exit:** A reviewed visual direction and component/state examples guide Task 4. A package migration is not a substitute for this checkpoint. No visual prototype or user approval is claimed by writing the plan.

## Task 1: Freeze the acceptance ledger and deletion baseline

**Files:** `docs/release/2026-10-05-core-acceptance-ledger.md` and `docs/release/2026-10-05-simplification-scoreboard.md` (create); `docs/product/saathi-v1-product-requirements.md` and `CONTEXT.md` (narrow reconciliation); `package.json` and lockfile (only confirmed dependency cleanup). Inspect `hooks/useTaskStore.ts`, `lib/realtime-websocket.ts`, duplicate toast/mobile hooks and their actual imports before considering deletion.

**Interfaces:** Keep public `TaskStatus = "todo" | "in-progress" | "done"`. Document any SQL storage mapping explicitly. No database rename or API change.

- [ ] Record branch, HEAD, dirty files, installed package versions and the exact replacement file manifest. Count production LOC and identify reachable callers using imports and build evidence, not filenames.
- [ ] Populate FR01-FR13 and NF01-NF12 with expected role/input, UI/action/data owner, success/negative/recovery result, flags, latest evidence, current classification and remaining check. Classify as locally verified, implemented/unverified, missing or intentionally optional. Deployment evidence gets its own column.
- [ ] Correct status terminology in docs against the current mapper and public contract; preserve historical evidence dates.
- [ ] Identify unused dependencies and duplicate implementations. Remove only items proven unreachable and not required by generated components or build/test tooling; update lockfile through the package manager.
- [ ] Run existing focused checks for changed code, then `npm run type-check`, `npm run lint`, `npm test`, `npm run build`. Record the actual baseline without disguising skips.

**Exit:** One current ledger and an explicit deletion list. A reviewer can distinguish missing behavior from stale documentation. Suggested checkpoint: `chore: establish core acceptance and remove unused code`.

## Task 2: Replace Board server-state plumbing if the trial proves simpler

**Files:** `hooks/use-task-board.ts`, `hooks/use-task-board.test.cjs`, `components/workspace-board.tsx`, `app/dashboard/page.tsx`, `app/layout.tsx`, `package.json`/lockfile; create `components/providers/query-provider.tsx`, `lib/task-query-keys.ts`, `tests/e2e/board-state.spec.ts`. Inspect `hooks/use-workspaces.ts` and `hooks/useRealtime.ts` for duplicate reads. Do not introduce a parallel task store.

**Interfaces:** Preserve `useTaskBoard(workspaceId: string, refreshSignal: number)` return behavior: tasks, aggregates, filters, changeFilters, nextCursor, loading, loadingMore, error, reload(): Promise<boolean>, loadMore(): Promise<void>. Supply authenticated actor ID through the provider so query keys include actor, workspace and normalized filters. Consume existing `getTasksPage`, `getWorkspaceTaskAggregates`, `getTaskById`, TaskPageInput and TaskAggregates contracts unchanged.

- [ ] Write rendered tests for old-account late response, filter change during Load more, duplicate click, failed refresh retaining last data, realtime invalidation, deep task reads and committed-write/read-failure feedback. Run and retain any current failing behavior before replacement; do not force already-passing tests to fail artificially.
- [ ] Install a pinned supported TanStack Query version only for this trial. Add one query provider; use infinite queries for pages and a separate aggregate query. Keep semantic action failures as failures, not success-shaped cached objects.
- [ ] Use explicit query defaults: no mutation retries; no retries for unauthenticated/forbidden/validation/conflict results; initially no automatic query retries; no redundant polling alongside SSE. Reset or remove pages deliberately on filter/workspace scope changes and mutation refresh. Preserve the current first-page refresh behavior unless a later requirement changes it.
- [ ] Clear previous actor data at logout/account change. Late promises must not repopulate a new actor scope. Query keys partition data but never replace server authorization. Normalized client filters exclude cursor/limit; page parameters own cursors.
- [ ] Keep form drafts, command IDs and expected versions outside query data. Maintain existing create receipts and mutation outcome handling. Convert SSE events into targeted invalidation rather than a second fetch owner.
- [ ] Compare the trial to the frozen baseline: lifecycle LOC including provider/key/error adapters, requests, production bundle size and browser behavior. Adopt only if the simplification gate passes; otherwise remove the trial dependency and all trial code. Never leave both implementations behind a permanent flag.
- [ ] After a successful Board trial, migrate another read owner only if its explicit replacement also meets the same gate. No all-hooks migration is required for completion.

**Exit:** One Board read owner, the same server contracts and fewer lifecycle mechanisms. Suggested checkpoint: `refactor: simplify Board data lifecycle` or documented rejection with no shipped trial.

## Task 3: Make older Activity reachable without duplicating paging machinery

**Files:** create `lib/activity-page.ts`, `lib/data/activity-page.test.ts`, `tests/e2e/activity-history.spec.ts`; modify `lib/data/activity.ts`, `app/actions/activity.ts`, `components/activity-history.tsx`, `package.json` database test registration.

**Interfaces:** `ActivityPageInput = { cursor?: string; limit?: number }`; `ActivityPage = { events: ActivityEvent[]; nextCursor: string | null }`; `listActivityPage(actorId: string, workspaceId: string, input?: ActivityPageInput): Promise<ActivityPage>`; `getWorkspaceActivityPage(workspaceId: string, input?: ActivityPageInput): Promise<{ success: true; page: ActivityPage } | { error: string; code: "unauthenticated" | "forbidden" | "validation" | "unavailable" }>`. Retain `getWorkspaceActivity` and `listActivityEvents` while actual callers need their compatibility shape.

- [ ] Write database checks for 137 events with identical and microsecond timestamps, full traversal without duplicates, malformed/cross-workspace cursors, archived reads and revocation between pages. Run the focused database file against the authorized test DB; observe the missing contract fail.
- [ ] Add strict opaque workspace/order/boundary cursor validation, default 50/max 100 and one-row lookahead. Order by stored created_at DESC and id DESC; compare the stored SQL timestamp rather than JS-rounded dates. Recheck membership on every page.
- [ ] Add Load older activity with loading/error/retry states and ID deduplication. Retain the latest page after refresh; older pages remain reachable. If Task 2 was adopted, use its library primitives; otherwise retain a small local lifecycle. Do not build a generic pagination framework.
- [ ] Run focused database tests and browser checks for traversal, retry retaining existing events, scope switch and owner/member visibility. Remove compatibility functions only after proving they have no callers.

**Exit:** Every retained activity event is reachable through authorized continuation. Suggested checkpoint: `feat: make workspace activity history traversable`.

## Task 4: Simplify visible choices and deliberate editing

**Files:** `components/task-list.tsx` (including its existing inline `TaskListItem`), `components/task-filter.tsx`, `components/workspace-overview.tsx`, `components/task-quick-add.tsx`, `components/workspace-create-form.tsx`, `components/member-manager.tsx`, `components/task-comments.tsx`, `app/dashboard/page.tsx`, `app/globals.css`, `lib/saathi-design.ts`; existing `components/ui/*`; `lib/task-draft.ts`, `lib/task-contract.ts`; create `tests/e2e/core-ux.spec.ts`.

**Interfaces:** Keep existing mutation arguments, current expected-version capture and Task/TaskUpdate types. Preserve TaskQuickAdd's add callback and full editor's captured snapshot. Keep persisted state separate from local draft state.

- [ ] Write browser assertions for header/view/hash agreement, title-only creation, optional field discovery, read-only member details/comments, all filters, full field edits, keyboard movement and a stale conflict that retains the original draft.
- [ ] Make default cards compact: title, completion/status and necessary cues. Move deliberate edit/delete/assignment actions into the existing detail surface or labelled overflow menu. Retain all functionality and role safeguards; do not hide essential progress actions behind an unexplained icon.
- [ ] Apply the reviewed Task 0 visual direction through existing menu/dialog/input primitives and semantic tokens. Remove duplicate headings, repeated metadata labels and explanatory cards that merely restate controls. Hide unavailable creation AI content and adapt the layout to its absence. Keep loading, no matches, no tasks and read failure distinct. Use accurate singular/plural and clearly label whole-workspace totals.
- [ ] Use React Hook Form plus existing Zod only for the full editor if it replaces duplicate dirty/validation/error logic with a net reduction. Keep `buildTaskUpdate`'s date-only/instant clearing and captured-version contract. Never reset an open dirty form because query data changed. Keep quick-add native if that remains simpler.
- [ ] Preserve one success announcement and one relevant error location; avoid stacked duplicate toasts. Add explicit conflict guidance and retry actions without silently resubmitting a stale draft.
- [ ] Run browser journeys at desktop and 360px, keyboard-only, with long titles/comments, missing optional fields, owner/member and AI disabled. Record screenshots, actions and observations. Compare scoped LOC and request counts; a split into more files alone does not count as simplification.

**Exit:** The same core actions are easier to discover and quieter to view. Suggested checkpoint: `refactor: simplify everyday task interactions`.

## Task 5: Make core correctness and UX repeatable in CI

**Files:** `.github/workflows/ci.yml`, `package.json`/lockfile; create `playwright.config.ts`, `tests/e2e/core-ux.spec.ts`, `tests/e2e/board-state.spec.ts`, `tests/e2e/activity-history.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/fixtures.ts`; reuse `scripts/require-database-test.mjs`, existing migration/bootstrap scripts and domain tests. Add supported server-only markers to `lib/db/client.ts` and `lib/data/*` after checking direct Node test imports.

**Interfaces:** Add scripts `test:e2e` and `test:a11y`. Fixtures provide isolated owner/member/outsider and workspace IDs, and clean only their own records. Use protected CI test credentials when provider identity is required; do not expose secrets to fork PRs.

- [ ] Establish actual rendered React/browser coverage before replacing fake-hook tests. Retain useful domain tests; retire source-string/fake-harness checks only when equivalent behavior is verified with real React or browser tests.
- [ ] Add compile-time server/client import guards using Next-supported `server-only`. Adapt direct Node database test execution using an explicit server condition/test configuration, and verify genuine client imports still fail in a real Next build. Do not weaken the guard with a global mock.
- [ ] Run disposable database migrations from empty state and the existing integration suite in CI. Do not treat a production backup or live hosted project as a routine test fixture.
- [ ] Run owner/member/outsider rendered journeys, account switch during pending read, stale edit, unknown create response, filter/paging races, Activity continuation and mobile/keyboard flows. Fork PRs without provider secrets run safe local checks and report provider-bound checks as unavailable; trusted CI runs the complete gated suite.
- [ ] Add axe checks for core surfaces with zero critical/serious findings; separately verify keyboard focus, names, modal return focus, status announcements and 360px overflow. Passing axe is not complete accessibility proof.
- [ ] Validate the workflow with one intentionally broken branch in a disposable test context, then restore the fix. Record that a gate actually catches a relevant failure, not merely that its command runs.

**Exit:** The principal regression journeys are repeatable and CI failures are actionable. Suggested checkpoint: `test: enforce core browser and database acceptance`.

## Task 6: Measure and close the NFR gaps without speculative caching

**Files:** `scripts/load-test.ts`, `scripts/loadtest.k6.js`, `lib/load-test.ts`, existing SSE/authorization tests, `lib/data/profiles.ts`, `lib/auth-simple.ts`, `lib/db/client.ts`; create `docs/release/2026-10-05-core-nfr-acceptance.md`. Modify runtime files only for reproduced failures.

**Interfaces:** Existing authenticated reads/actions and SSE; normal admission limits unchanged. Reuse existing performance instrumentation; durable command tests record commit and observer timestamps without logging sensitive payloads.

- [ ] Measure warm reads on 10/100/1000 tasks with fixed regions, dataset, sample counts and query count. Measure filter/aggregate plans and complete Overview reads independently.
- [ ] Prepare 100 distinct authenticated users across multiple workspaces, <=25 members/workspace, without breaching provider setup quotas. Use authorized test resources, bounded request rates and exact fixture cleanup. If provider capacity prevents setup, record the gate as blocked and retain useful smaller measurements; do not weaken application limits or mislabel connections as users.
- [ ] Run >=15 minutes with >=1000 measured operations/events. Report p50/p95/p99, throughput, connection startup separately, unexpected error rate, complete delivery counts and durable commit-to-observer timing.
- [ ] Time active member removal and healthy reconnect/reconciliation against <=30s and <=5s. Exercise Redis delivery failure, pending outbox retry and duplicate notifications without duplicate domain writes.
- [ ] If startup remains slow, profile the application profile lookup/queue first. Trial a smaller authenticated identity projection or fresh batching only with a concrete contract and account-freshness tests. No global membership cache, auth bypass or blind pool increase. A getClaims/getUser change is conditional on signing mode and verified/disabled/revoked/expired account behavior.
- [ ] Resolve any measured failure minimally and repeat only the affected workload plus relevant regression checks. Publish an exact failure/pass record, cost usage and unmet budgets.

**Exit:** NF03-NF07 are measured against their actual envelope, or explicitly remain open with the limiting condition. No capacity claim based on a synthetic short run. Suggested checkpoint: `perf: close measured core capacity gaps` only if code changed.

## Task 7: Validate human usability and align help/flags

**Files:** `lib/product-guide.ts`, `lib/overview-capabilities.ts`, `lib/feature-flags.ts`, `app/guide/page.tsx`, `app/help/page.tsx`, existing flag/guide tests; create `docs/release/2026-10-05-human-ux-evaluation.md`.

**Interfaces:** Existing guide/capability data remains the authoritative product description. No new AI/help metadata platform. Existing AI/CSV flags remain server enforced, with defaults and role behavior documented.

- [ ] Audit guide destinations, names, roles and enabled capabilities against the accepted UI. Document flag purpose, default, owner, environment and review/removal condition; test direct actions with disabled flags as well as hidden UI entries.
- [ ] Prepare three neutral tasks: create/complete a task; assign/discuss a task as owner/member; find older history and recover from a conflict. Freeze the script before observation.
- [ ] With user-arranged participants, observe at least five unfamiliar people using Saathi without a tour. Proposed usability acceptance: at least four of five complete each applicable basic task without moderator rescue, zero accidental destructive actions, and correct understanding of completion/conflict feedback. Report time, navigation actions, misunderstandings and failures; small samples are directional.
- [ ] If participants have access to a comparable Jira test setup, run matched tasks and counterbalance order. Record experience differences and defaults. Claim a comparative improvement only for the observed tasks and evidence. If no comparison is available, report Saathi usability alone; do not invent superiority.
- [ ] Fix observed friction using existing controls and content. Re-test the failed task; do not add a tour to conceal a broken workflow.
- [ ] Record onboarding and AI help as future work. Core acceptance remains useful without either, and disabled AI must never disable manual task work.

**Exit:** Help matches reality; human usability has evidence or a clearly identified external participant dependency. Suggested checkpoint: `docs: align help and verified core workflows`, with UI fixes reviewed separately.

## Task 8: Integrate reviewable changes and prepare deployment-day acceptance

**Files:** update the acceptance ledger, simplification scoreboard, release records, `.github/workflows/ci.yml` evidence references and existing operational runbooks. No provider configuration changes in this task without authorization.

- [ ] Review the whole change against FR01-FR13, NF01-NF12 and the five review risks. Refresh final `npm run type-check`, `npm run lint`, `npm test`, `npm run test:database`, `npm run build`, E2E/accessibility and `git diff --check` as applicable. Record environment and actual skips.
- [ ] Publish the before/after scoreboard: production LOC deleted/added, discarded mechanisms, retained safety rules, package/bundle delta, request/latency measurements, remaining functional/NFR/provider gates. Stop refactoring once accepted outcomes are achieved.
- [ ] Stage explicit files into the checkpoint boundaries above only after commit authorization. Review staged diffs for secrets, fixtures/logs and unrelated changes. Push only after explicit push authorization; no automatic deployment.
- [ ] Carry forward deployment-day gates: one chosen environment and verified SHA, fresh migrations, Supabase confirmation/OAuth/recovery, invitation email/webhooks, real hosted Redis, outbox/retention scheduler and observed alerts, separation of preview/production, timed disposable restore, rollback procedure and measured cost/operating owner.
- [ ] Use precise release labels: locally accepted core, hosted release candidate, or production-ready beta only when the matching evidence exists. Human usability and comparative Jira claims remain separate from operational readiness.

**Exit:** A smaller maintainable implementation, an understandable core journey, reproducible evidence and explicit release boundaries.

## Execution and review boundaries

Recommended method: implement sequentially for shared data/UI changes; delegate independent rendered checks or UX audits in parallel when requested. Never let two agents edit the same shared hook/provider/dialog simultaneously. Review after each independently testable task. No automatic task commits.

Order: visual direction and review (Task 0) → Task 1 → Board trial (Task 2) → Activity (Task 3) → visible UX (Task 4) → repeatable gates (Task 5) → NFR (Task 6) → human/help checks (Task 7) → integration (Task 8). Task 1's read-only baseline can proceed during visual review. Add rendered tests alongside their owning task, then wire them into CI in Task 5. Participant scheduling may run alongside engineering without blocking unrelated correctness work. Deployment-day and future AI work remain outside local execution.

Use runtime feature flags for product capabilities, not as permanent refuge for duplicated implementations. A temporary rollout flag requires a tested rollback and a scheduled removal condition; a local query trial needs no customer-facing flag.

## Self-review

- Every remaining area in the October 5 gap review maps to a task or an explicit deployment/future-work boundary.
- Added Activity contracts are additive; existing Task status, mutations, cursors and version semantics remain compatible.
- Code reduction includes replacement adapters and cannot be claimed from relocation or removing safeguards.
- Five high-risk inputs have named test owners. Framework adoption is conditional; rejection leaves a coherent working implementation.
- Participant results, installed-version audits, new test results and NFR success are not claimed in advance. Targets newly proposed here require plan review before execution.
- This document is the requested consolidated plan. No product implementation, dependency installation, commit, push or deployment was performed while writing it.
