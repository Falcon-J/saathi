# Saathi Domain Context

## Product purpose

Saathi turns an intended outcome into a shared workspace where people can plan, assign, complete, and follow work together. The workspace is the collaboration and authorization boundary.

## Ubiquitous language

- **User**: a person authenticated by Supabase Auth and represented in Saathi by a profile sharing the Auth user UUID.
- **Workspace**: a goal-oriented container with editable metadata, members, tasks, and activity.
- **Owner**: the single workspace member allowed to edit workspace settings, manage membership, transfer ownership, archive, or delete the workspace.
- **Member**: a user who can read the workspace and participate in its tasks.
- **Invitation**: a time-limited request for one normalized email address to join one workspace, available in the recipient's in-app inbox and through a copyable link. Accepting requires the verified invited account; invitation mail is not sent.
- **Task**: one independently actionable outcome, normally owned by one member and belonging to exactly one workspace.
- **Task comment**: an immutable member-authored note that adds execution context to one task.
- **Activity event**: a durable audit fact created by a successful domain mutation.
- **Realtime event**: an ephemeral notification that tells connected clients to refresh authoritative data.
- **Workspace version**: an integer incremented on workspace metadata changes to detect stale edits.
- **Task version**: an integer incremented on task changes to detect stale edits.

## Authoritative ownership

- Supabase Auth owns identity, passwords, verification, recovery, and sessions.
- Supabase PostgreSQL owns profiles, workspaces, membership, invitations, tasks, task comments, activity events, and durable outbox events.
- Upstash Redis owns rate-limit state, short-lived idempotency claims, presence, and realtime streams.
- SSE transports notifications only. A client always reconciles against PostgreSQL after reconnect or a version mismatch.
- Groq may interpret user intent but never authorizes users or confirms persistence.

## Invariants

1. A workspace has exactly one owner, and that owner is also a workspace member.
2. A user can be a member of a workspace at most once.
3. Only the owner can edit workspace metadata or membership.
4. A task belongs to exactly one workspace.
5. A task assignee, when present, must be a member of that task's workspace.
6. Only one pending invitation can exist for a workspace and normalized invitee email.
7. An invitation may transition from pending to accepted, declined, revoked, or expired; terminal states cannot be overwritten.
8. Accepting an invitation repeatedly cannot duplicate membership or activity.
9. Durable mutations and their outbox events commit in the same PostgreSQL transaction.
10. Empty workspace UI is shown only after an authenticated workspace query succeeds with zero rows.

## Dashboard states

- `auth-loading`: session is unresolved; show the page loader.
- `workspace-loading`: session exists and workspace query is unresolved; show the workspace loader.
- `workspace-error`: workspace query failed; show retry without an empty-state form.
- `zero-workspaces`: query succeeded with zero memberships; show the intention-based creation form.
- `creating-workspace`: an existing user explicitly requested another workspace; show creation with cancel.
- `workspace-ready`: a valid workspace is selected; show Overview (Ready and Waiting), Board, or Team content.

## Compatibility decisions

- Existing Redis Streams and SSE event names remain compatible during the persistence transition.
- Existing Redis durable records are retained temporarily for rollback but are not dual-written.
- The PostgreSQL cutover starts with an intentionally empty dataset unless a separate import is explicitly approved.
- A task uses either a date-only `dueDate` or a precise `dueAt` instant, plus the workspace IANA timezone for rendering. Existing date-only commitments remain calendar dates rather than being converted to instants.

## Capacity verification

Use the `Disposable Linux performance acceptance` GitHub Actions workflow for the real Auth/PostgreSQL/Redis capacity gate. It keeps 100 identities, 1,000 writes over 900 seconds, normal admission limits, read p95 at most 750ms and delivery upper-bound p95 at most 2,000ms, and unexpected failure rate below 1%. Disposable password sign-ins are paced before measurement under the normal Auth quota; measured task reads and writes are not retried by the load generator. Only sanitized evidence is uploaded, and the exact local project and Redis container are removed afterward.


## State-machine inventory

This catalog covers first-party product, client coordination and server lifecycle state machines. UI primitives delegated to React/Radix and external provider internals are grouped rather than reimplemented. State names describe behavior; they need not be literal enum values in every component.

### Product and identity

| Machine | States and transitions | Authority and guards | Implementation |
| --- | --- | --- | --- |
| Identity/session | unresolved → anonymous, verified, or unavailable; verified → refreshed or signed out | Supabase live identity; confirmed email and profile match; unverified cookie contents never authorize | lib/auth-simple.ts, lib/session-boundary.ts, proxy.ts |
| Registration/sign-in | editing → submitting → validation/error, confirmation-required, or authenticated → redirect | Hydration and synchronous duplicate-submit guards; sanitized local redirect; confirmed sign-in clears account boundary | components/auth-form.tsx, lib/supabase/auth-boundary.ts |
| Recovery callback | requested → email sent → code exchange → valid recovery or expired/unavailable link | Supabase owns proof; private no-store callback; reset destination requires recovery context | app/auth/callback/route.ts, app/(auth)/reset-password/page.tsx |
| Password update | editing → updating → rejected or password committed → session ended or cleanup required → retry sign-out | Committed password is never reported as rolled back when local sign-out fails | components/password-recovery-form.tsx, lib/auth-simple.ts |
| Invitation email proof | unverified → requesting → sent → verifying → verified, invalid, throttled, or unavailable | Current identity and normalized email must match proof; changed email invalidates proof | components/invitation-email-verification.tsx, app/actions/invitations.ts |
| Addressed invitation | pending → accepted, declined, revoked, or expired | Verified invited email; owner revokes; terminal transitions immutable; repeated response idempotent | lib/data/invitations.ts, components/invitation-response.tsx, app/invitations/[id]/page.tsx |
| Bearer invitation link | pending → joining → accepted, rejected, expired, revoked, or uncertain → authorized recovery | One winning actor; workspace/invitation locks; accepted recovery requires that actor and current membership; outsiders do not receive terminal workspace details | components/join-invitation.tsx, lib/data/invitations.ts |
| Workspace lifecycle | intention/editing → creating → active → archived or deleted | PostgreSQL owns lifecycle; owner and expected version required; archived workspaces are terminal/read-only by current product contract | components/workspace-create-form.tsx, lib/data/workspaces.ts |
| Ownership/membership | absent → invited → member → removed/left; owner → ownership transferred → member | Owner remains a member; transfer target already member; leaving owner must transfer; assignments cleared atomically; committed removal survives refresh failure | lib/data/workspaces.ts, hooks/use-workspaces.ts, components/member-manager.tsx |
| Workspace settings | baseline → dirty → saving → saved, rejected, or version conflict → review/rebase/discard | Persistent account/workspace draft; current owner and version; confirmed destructive consequences retained | components/workspace-settings.tsx |

### Client coordination and editing

| Machine | States and transitions | Guard/recovery | Implementation |
| --- | --- | --- | --- |
| Dashboard | auth-loading → workspace-loading → workspace-error, zero-workspaces, creating-workspace, or workspace-ready | Only successful zero-membership query shows empty creation; errors remain retryable | lib/dashboard-state.ts, app/dashboard/page.tsx |
| Selection/navigation | remembered selection → authorized workspace/fallback; Overview/Board/Team/Activity/Settings; dirty → stay or discard → navigate | Account/workspace namespace; browser history and hash; confirmed sign-out clears only that account's session drafts | app/dashboard/page.tsx, lib/dashboard-navigation.ts, lib/draft-storage.ts |
| Workspace synchronization | idle → reading → ready/error; mutation/reconnect → coalesced refresh | Selection identity and monotonically increasing read generation prevent late reads reviving another account/workspace | hooks/use-workspaces.ts, lib/read-coordinator.ts |
| Board pagination | filters/cursor → loading → page, empty, error; load-more → append; changed scope → reset | Stable normalized scope; current generation only; cursor remains tied to workspace/filters; authoritative refresh after uncertainty | hooks/use-task-board.ts, components/workspace-board.tsx |
| Task editor | closed → viewing/read-only/editing → dirty → saving → saved, rejected, conflict, or uncertain → reconcile/review/discard | Current permissions and version; scoped session draft; same command retained until outcome reconciles; cancel preserves recovery guidance | components/task-list.tsx, lib/task-draft.ts |
| Quick add | editing/details → validation → saving → saved, rejected, or unknown → reconcile/retry | Persist exact command before dispatch; scope-specific drafts; authoritative read before creating another command after uncertainty | components/task-quick-add.tsx |
| Graph refresh | loading → complete graph, empty, forbidden, or error; event burst → active read plus one trailing read | Complete authorized snapshot; account/workspace/request generation guards; no unused full task-list subscription on Overview | components/next-work-view.tsx |
| Prerequisite editing | inspecting → selected edge change → pending receipt → committed/rejected/unknown → same-command recovery | Creator/owner, expected task version and durable command; browser recovery storage required before dispatch; reload retains unresolved change | components/next-work-view.tsx, app/actions/task-dependencies.ts |
| Comments | loading/paginating/realtime refresh → ready/error; typing → saving → committed/rejected/unknown → reconcile/retry | Account/workspace/task draft and exact command survive remount; scoped stale reads ignored; stored receipt protects against duplicate publication | components/task-comments.tsx |
| CSV import | choosing → reading/parsing → preview → importing → complete/partial/rejected/unknown; committed + refresh failure → warning | Validated rows and stable per-row command IDs; do not retry the entire import as a new operation after ambiguous outcome | components/task-import.tsx, lib/csv.ts |
| Advisor UI | question/capability → requesting → answer/proposal/error; proposal → confirming → committed/rejected/unknown → recover same proposal/key | Advice cannot mutate; explicit confirmation; scoped retained proposal and command; unresolved confirmation cannot be replaced/dismissed | components/workspace-advisor.tsx |
| Activity history | loading → page/empty/error; older page → append; realtime → reload | Generation guards and authoritative durable activity; retry does not invent history | components/activity-history.tsx, lib/data/activity.ts |
| Archive browser | workspace list → selected workspace → tasks/details → read-only content/error | No implied restore transition; server enforces archive restrictions | components/archive-history.tsx, app/archive/page.tsx |
| Presentation utilities | overlay closed/open; confirmation pending/confirm/cancel; toast visible/dismissed/removed; viewport/theme unresolved/resolved | Existing accessible Radix interactions; focus restoration; timers and media/system changes; no domain authority in presentation state | components/ui/, hooks/use-toast.ts, hooks/use-mobile.ts, components/theme-provider.tsx |

### Durable state and delivery

| Machine | States and transitions | Authority and invariants | Implementation |
| --- | --- | --- | --- |
| Task status | create todo; todo/in_progress/done edits; toggle open→done or done→todo; delete→absent | Workspace lock, current membership and permission, expected numeric version or exact timestamp; mutation/activity/outbox atomic | lib/data/tasks.ts |
| Readiness projection | unfinished task → Ready when all prerequisites done, otherwise Waiting; completed + unfinished prerequisite → Review completed work | Derived from complete consistent graph, never persisted separately; advisory readiness does not forbid completion | lib/next-work.ts |
| Dependency graph | validated → workspace lock → authorized/version checked → edge changed + version/event/receipt committed; replay → current task or confirmation after deletion | Reject cycles, self/cross-workspace links, duplicate edges; serialize opposite-edge race; replay checks current authorization | lib/data/task-dependencies.ts |
| Optimistic mutation | current version → commit → next version; stale/missing expectation → conflict | Lock plus version predicate; monotonically advanced update timestamp; failure of transport is not proof of rollback | lib/data/tasks.ts, lib/mutation-result.ts |
| Command receipt | absent → committed receipt → exact replay; changed input/type with same key → conflict | Workspace+actor+command scope; receipt and change share PostgreSQL transaction; receipt confirms historical commit, not current entity state | lib/data/command-receipts.ts |
| Postcommit scheduling | unscheduled → scheduled → batching; another commit → pending; bounded drain → complete/deferred | Cache/scheduling/publication errors do not undo committed mutation; backlog retained for worker | lib/post-commit.ts |
| Outbox | pending → leased → published; failure → pending; abandoned lease → reclaimable after five minutes | Atomic SKIP LOCKED claim, max25; claim token fences stale ACK; delivery is at least once, not exactly once | lib/data/events.ts |
| Retention worker | authorized → flush → cleanup → healthy/deferred | Timing-safe worker credential; retain unpublished obligations/activity/receipts; expire published copies and AI metadata after30 days; cleanup failure is degraded, not healthy | app/api/internal/outbox/route.ts, lib/data/retention.ts |
| SSE admission | unauthenticated/invalid/forbidden reject; admitted → leased connection → streaming → release; exhausted →429 | Current session/membership; atomic Redis-clock leases; bounded counters; failed dependency fails closed | app/api/realtime/route.ts, lib/sse-connection.ts |
| SSE polling | setup → connected → polling idle/in-flight → transient error/recovery or closed | Single-flight poll;30s heartbeat; max4-minute stream; membership before each event batch and at least every5s idle; async completions cannot deliver after close | app/api/realtime/route.ts, lib/realtime-sse.ts |
| Replay/reconciliation | no cursor→latest boundary; retained cursor→replay; trimmed/out-of-bounds cursor→resync-required→authoritative refresh | Redis IDs establish ordering; cursor is rechecked against retained bounds; Redis is not durable product authority | lib/realtime-sse.ts, lib/redis-streams.ts, hooks/useSSE.ts |
| Browser connection | disconnected → connecting → connected → interrupted/backoff → reconnect/resync; unmounted → stopped | Account/workspace scope and cancellation; use event revision to request authoritative reads; normal rotation is expected | hooks/useSSE.ts, hooks/useRealtime.ts |
| Membership batching | fresh exact pair → queued → active batch → allow/deny/error → evicted | Only pending work shared; exact actor/workspace pairs; completed decisions never cached | lib/sse-authorization.ts |
| Presence | absent → timestamp + active-set member → heartbeat refresh → stale/expired → removal | Five-minute last-seen, not instantaneous online status; timestamp and active-set expiry; stale mock timers cannot delete renewed state | lib/realtime.ts, lib/redis.ts |
| Rate admission | new fixed window → allowed count → rejected count → next window | Hashed scope; atomic increment+initial expiry; Redis error fails closed; adjacent-window burst is inherent contract | lib/rate-limit.ts |
| Redis adapter | configured/unconfigured → real backend or explicit development mock; unavailable → bounded retries → recovered/unavailable | Configured production backend never silently switches to mock; production commands preserved; mock TTL replacement/reset follows Redis | lib/redis.ts, lib/redis-policy.ts |
| Advisor service/telemetry | authorized projection → disabled/rate-limited/provider pending → valid/invalid/unavailable; confirmation → durable task | Provider has no mutation authority; validated projection/response;20s timeout; metadata best effort without prompts/output | app/actions/workspace-advisor.ts, lib/ai/workspace-advisor-service.ts, lib/groq-chat.ts |

### Dormant and compatibility paths

- lib/realtime-websocket.ts has no production importer. Its WebSocket claims are not live guarantees.
- hooks/useTaskStore.ts and its useRealtimeTasks path have no external production callers.
- persistWorkspacePlan/applyWorkspaceCommand in lib/workspace-intent-service.ts have test-only callers; they are not current workspace creation.
- /tasks/stream is a live compatibility redirect to /api/realtime; it must preserve the query and therefore workspace scope.
- Shared UI primitive/internal provider state is delegated to its maintained library; it must not be duplicated as product state.

### Verification contracts

Behavioral tests cover generation/scope changes, draft remounts, storage failures, duplicate submits, unknown outcomes and definitive rejection. Real database tests cover lock races, stale versions, receipt replay, current authorization, graph invariants, invitation terminal transitions and outbox lease fencing. Browser acceptance covers hydration/accessibility and the real owner/member/outsider Ready and Waiting path. Capacity evidence remains a separate100-user/1000-write/900-second gate. A passing read or receipt alone must not be reported as a current end-to-end live result.

Provider transport metadata currently groups some provider429 and malformed JSON/schema failures under provider_unavailable. User recovery remains retryable; this is a diagnostic classification limitation rather than a durable-state transition failure.

## Canvas and external agent boundaries

- Company, space and section resources organize workspaces through one canonical path. References never grant access. Workspace membership remains mandatory; section capabilities only narrow existing ownership, creation and assignment rules. Restricted sections reset inheritance; management does not bypass restricted descendants.
- MCP identity uses a dedicated OAuth audience and allowlisted client. Revocable application capabilities and workspace restrictions are separate from provider identity scopes and are checked on every dispatch and retry.
- Agent runs use finite task leases and fencing tokens. Progress and evidence remain advisory until a signed-in human with current task permissions reviews them. External clients cannot invoke approval.
- Canvas, command bar and MCP reuse authoritative domain operations. Layout and camera state never change task status or permissions. Historical command responses carry a replay marker and current visibility checks.
- Canvas locations use bounded ID selectors in /canvas URLs: resource, or workspace with optional task; view opens an authorized work area and group narrows Ready/Waiting. URLs contain no draft content or camera state and grant no access. Initial and browser-history restoration wait for current authorized lists and the matching graph; unknown or revoked locations recover generically.
- Mobile work fills the working surface while keeping the canvas/camera mounted. Hidden creation and editor drafts remain protected at page/workspace boundaries; another task cannot replace an unresolved editor draft. Task sheets and secondary overlays are shown only for the current working view.

See [ADR 0002](docs/adr/0002-shared-commands-and-canvas-access.md) for the accepted architecture.

### Canvas and agent state machines

| Boundary | States and authoritative transition rules |
| --- | --- |
| Canvas navigation | Overview, workspace focus and task focus retain stable record identity. Zoom changes representation. Manual navigation ends agent following; incoming events do not steal the camera. |
| Section access | Inherited or restricted policy; explicit grants may be active, expired or revoked. Membership and a fresh canonical-path policy snapshot are both required. Placement and references never grant membership. |
| Agent connection | Disabled or configured endpoint; verified OAuth identity plus active, expired or revoked application grant. Disconnection revokes application access before optional provider cleanup; disabled endpoints do not prevent revocation. |
| Shared command | Validated and admitted, then committed, rejected, conflicted or unconfirmed. Actor/client command identity separates external clients. A replay is explicitly historical and rechecks current permissions and visibility. |
| Agent run | Queued, running, awaiting review, succeeded, failed or cancelled. Finite leases and increasing fences reject stale workers. Current human review and task version govern approval. Cancellation does not assert that an external process stopped. |
