# Saathi engineering baseline evidence

Date: 2026-10-04. Source: implementation worktree at 4dcd78d.
Plan: ../superpowers/plans/2026-10-04-saathi-v1-engineering-baseline.md

## Verification

| Check | Observed result |
| --- | --- |
| npm run type-check | PASS, exit 0 |
| npm run lint | PASS, exit 0 |
| npm test | PASS outside sandbox: 151 passed, 1 skipped, 0 failed |
| Initial sandbox npm test | Child-process preflight test failed; retry outside sandbox passed unchanged |
| npm run build | PASS outside sandbox, exit 0; initial sandbox spawn EPERM was environmental |
| Existing database test files | PASS against current database explicitly authorized as test-only: 29 checks, zero failures/skips after bigint assertion correction |
| Hosted journeys/providers/load/restore | NOT RUN in this execution |

The normal suite skips its database-dependent AI check without DATABASE_TEST_URL; that check was separately executed successfully against the authorized database. Environment validation reported development mock Redis; these checks do not prove hosted Redis behavior.

## Current database verification

User authorization: current resources are test-only; use existing resources to solidify core behavior. Fresh deployments belong to a separate deployment day.

The existing npm database preflight remains loopback-only. For this explicitly authorized hosted run, loaded .env.local into the process, assigned the configured DATABASE_URL to the child process DATABASE_TEST_URL, and ran the existing files sequentially with Node's test runner. No credentials were printed or written into documentation; no migrations or resets were performed.

| Test file | Passed | Scope |
| --- | --- | --- |
| lib/db/schema.test.ts | 9 | Profile trigger, membership/owner/assignee constraints, invitation uniqueness, stale writes, rollback, domain-access migration assertions |
| lib/data/workspaces.test.ts | 10 | Input normalization, atomic creation, denied actors, concurrent edits, member removal/unassignment, deferred outbox and deletion |
| lib/data/collaboration.test.ts | 6 | Invitation preview, duplicate acceptance, task permissions/partial edits, expiry |
| lib/data/comments.test.ts | 1 | Member-only comments and durable activity |
| lib/data/ai-operations.test.ts | 3 | Metadata validation, persistence and outsider denial |

Initial AI persistence assertion failed because raw postgres bigint values deserialize as strings. The test now compares BigInt(row.estimated_cost_micros) with BigInt(400), preserving exact integer semantics and the existing TypeScript target; application code was unchanged. Observed failure before correction and passing rerun afterward. Test fixtures use generated UUIDs and cleanup/rollback; the suite did not reset existing records.

## Capability and evidence matrix

I = implementation found, U = end-to-end unverified, B = environment prerequisite blocked. None of these classifications is a production verification claim. Tests listed are available coverage, not proof of all behavior in the row.

| Requirement/capability | Entry and command | Durable authority and permission | Available coverage | Failure/refresh requirement | Status/blocker |
| --- | --- | --- | --- | --- | --- |
| FR01 registration/login/recovery/OAuth/logout | (auth) pages; auth/callback; auth-simple and supabase modules | Supabase Auth, verified profile | Auth boundary, session, password/form tests | Intended route, cookies, refresh and expired session | I/U: hosted provider and browser journeys |
| FR02 workspace create/select/edit/archive/delete/transfer | Dashboard; actions/workspaces.ts | data/workspaces.ts; owner/admin and current membership | Workspace DB tests available | Archive read/write split; ownership transfer race; refresh | I/B: database suite and browser journey |
| FR03 invite/accept/decline/revoke/resend/remove | Member manager; invitations/[id]; actions/invitations.ts | PostgreSQL membership/invitations; owner or intended recipient | Invitation domain/contract tests | Duplicate acceptance, expiry, remove/unassign, email fallback | I/B: DB and two accounts/email |
| FR04 task create/edit/assign/complete/reopen/delete | Overview/Board; tasks/actions.ts | data/tasks.ts; membership and owner/creator/assignee | Permission/contract tests; DB collaboration tests available | Conflict, clear fields, denied actor, authoritative refresh | I/B: DB and browser journey |
| FR05 deadlines/priority/estimate/lane | Task editor/card; task contract | PostgreSQL constraints and validated command | Deadline/draft/contract tests | Date-only timezone; omission versus clear | I/U: full persistence and UI checks |
| FR06 Overview/Board/search/filter | dashboard/page.tsx; overview-capabilities; use-workspaces | Shared authorized task projection | Overview/navigation tests | Both views agree after changes and refresh | I/U: live user interaction |
| FR07 comments/activity | actions/comments.ts; actions/activity.ts | data/comments.ts/events.ts; member-only | Comments DB tests available | No unauthorized comments; immutable history and deletion policy | I/B: database and journey |
| FR08 CSV import | Board import; actions/migration.ts | Existing addTask path; current member | CSV parser tests | <=512 KiB/100 rows; partial results; no blind whole-file retry | I/U: action integration and import controls |
| FR09 realtime/recovery | api/realtime; useSSE/useRealtime/use-workspaces | Redis notification; PostgreSQL recovery; membership | Realtime cursor/dedup/lease tests | Revocation, replay gap, disconnect, duplicate, switching | I/U: real Redis and connected two-user timing |
| FR10 AI workspace plan/advisor/confirmation | workspace-intent and workspace-advisor actions | Minimum authorized projection; deterministic commands | AI schema/service/confirmation tests | Off mode, refusal, invalid draft, retry claim window | I/U: optional provider and browser confirmation |
| FR11 usage | GET api/usage | PostgreSQL activity; member-only | DB and route inspection required | Durable across instances and retries | I/U: counter correctness |
| FR12 explicit product states | Dashboard/forms/hooks | Command result and authoritative reload | Recovery/form tests | Offline/conflict/unknown commit outcome and archived behavior | I/U: browser failure exercises |
| FR13 capability flags | lib/feature-flags.ts; dashboard/guide/AI actions | Server availability independent of permissions | Existing strict AI flag tests pass | Stale UI cannot bypass disabled server action | Existing AI public flag I; proposed server controls/CSV flag not implemented |

## Confirmed findings and rulings

- Task list uses an ID query followed by one joined projection query per task. Efficiency improvement must preserve records and authorization.
- Missing task version is already rejected by matchesTaskVersion. Optional TypeScript arguments do not mean mutations bypass concurrency checks.
- flushOutbox catches failed publication and returns deferred delivery; committed domain mutations remain successful.
- SSE route contains an authorization recheck in its delivery lifecycle. Timing and actual revocation behavior still need measurement; absence is not asserted.
- Ruling: existing linked worktree reused; unrelated files preserved; no new worktree or dependency install needed for baseline.
- Ruling: sandbox child-process failure treated as environment failure after unchanged unsandboxed tests passed; no test code patched.
- Ruling: baseline tests are local deterministic coverage, not hosted feasibility proof. Missing database configuration does not justify using a hosted production database.

## Execution state

### Two-browser collaboration acceptance

Executed against the local current app at http://localhost:3002 with the existing hosted PostgreSQL/Supabase Auth environment. Independent sessions: Chrome owner and Codex in-app browser member. Generated QA fixtures were seeded into auth users/identities with hashed random passwords after provider signup rejected reserved example.com addresses; ordinary Supabase password authentication succeeded for both. Existing auth policy was unchanged. This proves login/session behavior with seeded accounts, not signup email delivery or OAuth.

Observed PASS: both users signed in; member initially had no owner workspace; owner created QA Two Browser Collaboration Oct 04; owner sent invitation; email-unconfigured status offered copy-link fallback; member accepted through that link; owner-created task appeared in member Board without reload; unassigned member completion was disabled; assignment enabled member completion; member completion reached Chrome owner without reload; both refreshed and retained authenticated sessions and completed task state. Screenshots: browser-evidence/2026-10-04-owner-completed.png and browser-evidence/2026-10-04-member-completed.png.

Initial UI finding (now corrected below): member Board task title/detail control was disabled even when the member was the assignee. Completion was enabled, while edit/delete stayed restricted. This blocked Board read/comment access. Stale-edit conflict browser acceptance remains pending.

Provider boundaries: Redis credentials are absent and local realtime uses the development mock. Cross-browser SSE notification/reconciliation passed, but real Upstash delivery remains unverified. Invitation email delivery is not configured. QA accounts/workspace/task are retained as named test evidence; credentials are not included in this document. Fresh deployment remains deferred.

### Task contract and query improvement

TaskError now carries stable validation/forbidden/not_found/conflict/unauthenticated/unavailable categories. Task action results preserve their existing success/error/task shape and rate-limit retry hint; unexpected failures remain sanitized. Deadline validation errors are translated at the domain boundary. Existing hook conflict handling already reloads authoritative records and was preserved rather than duplicated.

Task listing retains the repeatable-read membership check, then projects all workspace tasks in one joined query. Single-record mutation reads and listing share a private row mapper. Equal creation timestamps use ascending ID as a deterministic tie-breaker.

Observed regression failures before implementation: missing validation code and five SQL statements for three listed tasks. After implementation: database collaboration test passed all eight checks, including exactly two statements independent of listed task count, empty lists, date-only/instant deadlines, nullable assignment, explicit clears, denied callers, missing/stale versions and missing task records. Local action contract test verifies code propagation, authentication, sanitized failures, rate limits and unchanged success response.

Type-check, lint, build and npm test passed after these changes (154 passed, one database-dependent test skipped in the ordinary suite). Final full database run passed 31 checks with zero failures/skips: schema 9, workspaces 10, collaboration 8, comments 1, AI operations 3. No measured latency or throughput improvement is claimed from query-count evidence alone. Two-user browser and real Redis recovery verification remain pending.

Task 1 baseline recorded; Task 7 inventory and minimal feature controls implemented. Task error codes and joined listing are implemented and verified as described above. Final suite: 154 passed, 1 skipped, 0 failed. The skipped AI operation test was separately executed against the authorized database. Browser journeys, real provider exercises, commits and deployments have not been performed. Remaining gates retain explicit unverified/blocked status.

Feature controls: ENABLE_AI_WORKSPACE overrides the legacy public flag; ENABLE_CSV_IMPORT defaults on when absent and rejects invalid explicit values. Dashboard loads boolean capabilities through a Server Action and hides optional controls when unavailable. Guide renders dynamically with the server flag. Direct AI generation, workspace-plan creation, advisor confirmation and CSV import are gated. A runtime test with stubbed provider/persistence dependencies verifies disabled direct actions perform zero provider calls and zero writes; it is not a hosted integration test. The resolver regression was observed failing before implementation and passing afterward.

Pending verification: browser enabled/disabled journeys and stale-client behavior; configuration diagnostics for malformed values; real-provider failure exercises; representative task-list timing measurements; capacity, cost, restore and alerts. Current database checks are complete for the existing suite; coverage does not prove every functional requirement. No overall functional-completion claim is made.

### Member task details and comments: current slice

Board task titles now open the existing detail dialog for authorized workspace members. Overview deep links use that same dialog. Existing owner/creator edit permissions select editable versus read-only fields; the submit handler also checks permission. Read-only members see Task details, disabled task fields, a Close action, no Save action, and the existing enabled comment composer. Completion, edit/delete controls and server domain permissions remain governed by their existing rules. No second detail renderer or AI feature was added.

Regression: the new navigation source check failed before the fix and passed afterward. This is source coverage, not a rendered component test. Current verification: type-check and lint passed; npm test passed 155 checks with one database-dependent AI test skipped. The sandbox preflight child-process restriction caused the first full-suite failure; the unchanged permitted rerun passed. The existing comments database test was rerun against the explicitly authorized current test database and passed membership enforcement plus one durable activity event.

Browser PASS in the in-app QA member session: Overview detail link opens Task details; task fields are disabled; Save is absent; comment composer is enabled; member comment submitted; page refreshed; Board title opens the same dialog and the comment remains visible. Assignment completion remains available on Board while status/assignment edits stay disabled. Screenshot: browser-evidence/2026-10-04-member-details-comment.png.

Browser LIMIT: Chrome owner tab disappeared during this slice. Recovery timed out and then reported no available tabs. Owner receipt/live refresh of this new comment, ordinary unassigned-member and removed-member UI cases remain pending. Earlier two-browser task collaboration evidence is retained separately above. No full FRS/NFR completion claim, commit or deployment is made.

Next core evidence work: finish the remaining role/comment journeys, then FR01-FR13 acceptance scenarios and the simple UX review. Provider realtime, load, revocation, restore, alerts and cost targets remain NFR gates. AI implementation remains deferred until core acceptance is complete.

### Core foundation and functional hardening continuation

Ruling: retain the current stack and domain ownership; make incremental changes at existing interfaces rather than rewriting the application or introducing a service framework. The user explicitly requested code structure and foundation review alongside continued core completion. Review and ordered remaining work: ../architecture/2026-10-04-core-foundation-review.md.

Implemented: shared Task/TaskStatus/update contracts in lib/task-contract.ts with compatible app exports; Board reuses the Task shape and removes three Promise<any> callbacks. Added a dependency regression prohibiting application imports from durable domain modules. It failed on the two previous task imports, then passed.

Comment component regressions reproduced out-of-order reads and duplicate submit/realtime records. Scoped request generations, lifecycle cleanup, ID deduplication, caught transport errors and explicit refresh recovery now pass controlled runtime checks. Unknown save outcomes preserve the draft and disable resubmission until an authoritative read succeeds. The renderer remains shared, with task-keyed comment state. No durable comment idempotency is claimed.

Database regressions reproduced archived discussion denial and five statements for two comment records. Joined comment projection now requires three statements independent of record count; archive comments/activity remain readable to current members, writes remain rejected, and removed members/outsiders cannot read. Comment writes now explicitly lock workspace before task, consistent with other domain mutations. A statement-order test passes; no observed deadlock is claimed. One database attempt failed before fixtures with ECONNRESET; unchanged permitted rerun passed.

CSV action integration tests cover authentication, permissions, flags, byte/row bounds, metadata and partial failures. Unexpected thrown row errors were reproduced leaking verbatim, then sanitized with Board reconciliation guidance. Ordinary validation/action errors retain their existing public messages. These are dependency-controlled action tests, not browser upload persistence proof.

Usage now exposes getWorkspaceUsage(workspaceId, actorId), checks membership and aggregates in one read-only repeatable-read transaction. The HTTP success/error shapes remain compatible; successful responses are private/no-store. Regression observed outsider aggregation from the previous actor-less read before correction. Database check passes outsider/removed-member/missing-workspace denial and completion transitions versus ordinary edits; HTTP contract checks pass 401/400/403/200/503 without leaking private failures. This is a focused application read interface, not a new repository framework.

Browser: Chrome recovered. Member submitted a new QA comment while owner task details were open; owner saw it without reload. Owner Activity displayed durable comment events. Owner unassigned the task: member completion became disabled, while title/details, persisted discussion and comment composer remained accessible. Owner fields remained editable. Evidence: browser-evidence/2026-10-04-core-member-discussion.png and browser-evidence/2026-10-04-core-owner-activity.png. Real Redis, rendered network-failure recovery, removed-member browser timing and deployment proof remain separate gates.

Archive gap corrected: archived records have an explicit member-scoped list and archive-state projection, with an authenticated /archive page linked from Dashboard. The existing task dialog and activity renderer are reused. Archived task fields are disabled; Save and the comment composer are absent. Domain commands continue to reject archived writes.

Browser PASS: the in-app member followed the Dashboard archive link, discovered QA Archived Core Oct 04, opened QA archived task, and read its retained discussion. Refresh retained the workspace/task list. Expanded activity showed creation, comment and archive events. Screenshot: browser-evidence/2026-10-04-core-archive-details.png. This verifies the named fixture, not every archive failure or removed-member browser scenario.

Development foundation: a lazy database client is reused across module reloads, addressing a reproduced duplicate-client behavior. Session pool exhaustion was observed during testing; its full provider-wide cause is not inferred. Framework Server Function argument logging is disabled through the installed framework configuration, preserving ordinary request logs.

Independent review identified two additional gaps: a successful comment save could discard pending historical/concurrent reads, and archived member removal/deletion were still allowed by existing commands. Saves now trigger an authoritative reconciliation; the new race regression failed before and passed after. Archived removal and deletion now reject under the workspace lock; the database regression confirms retained membership and workspace. No permanent QA deletion was performed.

Final verification for this continuation: npm test passed 171 tests, with one database-dependent AI test skipped; the explicitly authorized existing database suite passed all 36 tests across schema, workspace, collaboration, comments, usage and AI operations. The affected 11 workspace checks were rerun after review fixes and passed. Type checking, linting, production build (including /archive), and diff whitespace checking passed. The local dev server is running with AI workspace capability disabled; provider AI was not invoked. Manual Board and archive reads remain available in that mode.

Keep the current Overview/Board design. Full auth/provider, CSV persistence, role-transition, stale-edit and rendered failure journeys remain acceptance work. Real Redis, workload, revocation, restore, alerts and cost checks remain NFR gates. AI remains deferred. No overall core-complete claim, commit or deployment is made.

### Core acceptance continuation: CSV, ownership and stale editing

Browser PASS: uploaded core-partial-import.csv through the existing file chooser. One valid task persisted after refresh with High priority and 25 minute estimate; the invalid zero-estimate row was absent. The browser tool took an unusually long time during upload and the transient warning was not captured; persistence is verified, notification timing is not. The fixture was not replayed, avoiding duplicate import.

Browser PASS: Chrome QA owner transferred the existing QA workspace to the in-app QA member. New owner gained Settings, invitations and member administration; former owner retained membership without those controls. New ownership survived refresh. The new owner transferred it back and both sessions reflected the restored original owner. Named screenshots: 2026-10-04-core-new-owner.png and 2026-10-04-core-former-owner.png.

Browser-discovered fixes: Overview previously enabled completion for an unassigned ordinary member while Board denied it. It now uses the same useTaskPermissions hook and received session email; runtime owner/creator/assignee checks pass, and browser Overview shows the unassigned task disabled. Quick add now catches transport rejection, preserves its draft and settles loading. Dashboard explicitly marks unknown create outcomes; Overview blocks immediate replay and offers a Board review that awaits authoritative task refresh. Component execution and wiring checks cover this recovery; rendered offline simulation remains open.

Stale-edit FAIL then PASS: both users opened one task, owner saved a newer description, then the old member draft overwrote it because the hook selected the latest realtime task version. The editor now passes its captured version through Dashboard to the update command; inline controls retain current-version fallback. A runtime hook regression failed before and passed after. Repeating the browser journey displayed a conflict and retained the draft. After cancel/refresh, the owner value remained intact. Screenshot: 2026-10-04-core-stale-edit-conflict.png.

Verification: npm test passed 175 tests with one database-dependent AI test skipped; final type checking and lint passed. The previous 36 database checks are retained; no domain SQL changed in this continuation. Production build from the preceding slice is not claimed rerun here. Auth/provider, invitation negative paths, remaining editor/date/filter/mobile/keyboard cases, rendered offline recovery and NFR measurements remain open. Direct in-app navigation to the usage API was blocked by the browser client, so real-session usage HTTP acceptance remains unverified. No AI provider invocation, commit, push or deployment.

### Task planning and recovery continuation

Corrected four task mutation handlers without introducing another state framework: rejected commands and transport failures now perform one authoritative recovery read. If recovery cannot read, the prior view is restored and the existing task error remains visible. This fallback is not proof that the command did not commit. Pending IDs clear in finally. Captured selection identity protects late success/failure updates, including switching users or revisiting the same workspace; obsolete recovery requests do not start loading or read another selection. Eight command/transport regressions and two selection regressions failed before and passed after, executing the actual hook callback bodies with controlled dependencies.

Browser FAIL then PASS: timed task editing sent both dueDate and dueAt, violating the existing mutually exclusive domain contract. buildTaskUpdate now clears date-only storage when submitting a timestamp; switching back clears the timestamp. The Board creation form follows the same contract. Deadline transition checks failed before and passed after. The browser editor then saved description, In progress status, Low priority, Oct 5 at 17:30 local time, 35 minute estimate and member assignment. All values survived page refresh and remained visible in the reopened editor. Screenshot: 2026-10-04-core-planning-fields.png. The initial field attempts overlapped development reloads; acceptance uses the subsequent settled save and persisted values.

Browser PASS: combined Low priority, member assignee and Active filters showed the one matching task; a nonmatching search produced zero results; clearing filters restored the rows. Full timezone/DST and filter cross-product coverage remains open. The In progress empty message is generic rather than explicitly filter-aware, a minor copy improvement still pending.

Mobile FAIL then PASS: at 360 by 800, navigation overflowed to 381 pixels and clipped Activity. Navigation now wraps; the measured document width was 345 pixels with all navigation entries visible. The task dialog measured 360 pixels with persisted planning fields readable. Screenshot: 2026-10-04-core-mobile-navigation.png. Temporary viewport override was reset. This is one mobile breakpoint, not a full accessibility acceptance claim.

Verification: 186 tests passed, one database-dependent AI test skipped; type checking, lint and production build passed before the final one-class mobile wrapping adjustment, which is separately browser verified. No SQL or provider configuration changed. Independent review found no actionable issues in command recovery and deadline fixes. Existing real provider, auth, revocation, restore, load, alerts and cost gates remain open. AI remains deferred; no commit, push or deployment.
