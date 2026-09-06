# PostgreSQL Workspace Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Supabase Auth and PostgreSQL, preserve Upstash-backed realtime coordination, add editable workspace settings, and ensure onboarding appears only after a confirmed zero-workspace query.

**Architecture:** Supabase Auth owns identity and sessions; Supabase PostgreSQL owns profiles, workspaces, membership, invitations, tasks, activity, and an outbox. Upstash owns limits, claims, presence, and Streams; Server Actions call focused domain modules and clients refetch PostgreSQL projections after realtime events.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase PostgreSQL, Drizzle ORM/Kit, `postgres`, Upstash Redis, Redis Streams, SSE, Zod, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-postgres-workspace-architecture-design.md`

## Global Constraints

- Supabase Auth is authoritative for identity, passwords, verification, recovery, and sessions.
- Supabase PostgreSQL is authoritative for all durable Saathi product state.
- Upstash is authoritative only for rate limits, temporary claims, presence, and realtime streams.
- Do not dual-write durable records to PostgreSQL and Redis.
- Do not delete old Redis durable keys automatically.
- Use committed, reviewed SQL migrations; never use schema push against production.
- Use Supabase transaction pooling for Vercel runtime traffic with prepared statements disabled; use the direct connection for migrations.
- Expose only the Supabase URL and publishable Auth key to the browser; keep database, service-role, and Upstash credentials server-only.
- Use normalized lowercase email values at persistence boundaries.
- Preserve existing SSE event names during cutover.
- AI remains optional and cannot authorize or confirm persistence.
- Stage and commit only files named by each task; preserve the existing uncommitted invitation work until it is deliberately reconciled.

---

### Task 1: Add the Supabase Auth, PostgreSQL, and local-stack foundation

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Create: `supabase/config.toml`
- Create: `supabase/seed.sql`
- Create: `drizzle.config.ts`
- Create: `lib/db/client.ts`
- Create: `lib/db/client.test.ts`
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/proxy.ts`
- Modify: `lib/env.ts`

**Interfaces:**
- Produces: `db`, Supabase browser/server Auth clients, cookie refresh support, validated Auth/database configuration, and a reproducible local Supabase stack.
- Consumes: no new application domain modules.

- [ ] **Step 1: Write a failing environment/client test**

```ts
test("database configuration fails closed outside development", () => {
  assert.throws(
    () => getDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: "" }),
    /DATABASE_URL is required/,
  )
})
```

- [ ] **Step 2: Run the focused test and confirm the missing export fails**

Run: `node --experimental-strip-types --test lib/db/client.test.ts`

Expected: FAIL because the database configuration/client does not exist.

- [ ] **Step 3: Install and configure the database packages**

Run: `npm install drizzle-orm postgres @supabase/supabase-js @supabase/ssr @upstash/ratelimit`

Run: `npm install --save-dev drizzle-kit supabase`

Add scripts:

```json
"db:generate": "drizzle-kit generate",
"db:check": "drizzle-kit check",
"db:migrate": "drizzle-kit migrate",
"supabase:start": "supabase start",
"supabase:stop": "supabase stop"
```

Initialize the project-scoped Supabase CLI configuration. Configure `postgres(connectionString, { max: 1, prepare: false })` for Supabase's transaction-mode pooler and wrap it with Drizzle. Use `DATABASE_MIGRATION_URL` only in `drizzle.config.ts`. Add browser/server Auth clients using the publishable key and cookie adapter; never use the service-role key in browser code.

- [ ] **Step 4: Validate configuration without exposing credentials**

Run: `node --experimental-strip-types --test lib/db/client.test.ts`

Run: `npm run type-check`

Expected: both pass; logs contain variable names only.

- [ ] **Step 5: Commit the foundation**

```powershell
git add package.json package-lock.json .env.example supabase/config.toml supabase/seed.sql drizzle.config.ts lib/db/client.ts lib/db/client.test.ts lib/supabase/browser.ts lib/supabase/server.ts lib/supabase/proxy.ts lib/env.ts
git commit -m "build: add Supabase application foundation"
```

### Task 2: Define the canonical schema and database invariants

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/schema.test.ts`
- Create: `drizzle/0000_saathi_core.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `profiles`, `workspaces`, `workspaceMembers`, `workspaceInvitations`, `tasks`, `activityEvents`, `outboxEvents` and inferred canonical row types.
- Consumes: `db` from Task 1.

- [ ] **Step 1: Write failing schema contract tests**

Assert the exported schema contains the columns and enum values in the approved spec and that the SQL migration contains:

```sql
PRIMARY KEY (workspace_id, user_id)
CREATE UNIQUE INDEX workspace_invitations_one_pending
  ON workspace_invitations (workspace_id, invitee_email)
  WHERE status = 'pending';
CHECK (estimated_minutes BETWEEN 1 AND 1440)
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `node --experimental-strip-types --test lib/db/schema.test.ts`

Expected: FAIL because `lib/db/schema.ts` and the migration are absent.

- [ ] **Step 3: Implement schema and generate the migration**

Define the seven tables from the spec with UUID keys, UTC timestamps, foreign keys, checks, cascade behavior, task/workspace versions, and the pending invitation partial index. Add reviewed SQL for the deferred owner-membership foreign key:

```sql
ALTER TABLE workspaces
ADD CONSTRAINT workspaces_owner_is_member
FOREIGN KEY (id, owner_user_id)
REFERENCES workspace_members (workspace_id, user_id)
DEFERRABLE INITIALLY DEFERRED;
```

Replace duplicate handwritten workspace/task interfaces in `lib/types.ts` with types inferred from the schema plus browser-safe projection types.

- [ ] **Step 4: Run migration and invariant checks against local PostgreSQL**

Run: `npm run supabase:start`

Run: `npm run db:migrate`

Run: `npm run db:check`

Run: `node --experimental-strip-types --test lib/db/schema.test.ts`

Expected: migration and tests pass.

- [ ] **Step 5: Commit the canonical model**

```powershell
git add lib/db/schema.ts lib/db/schema.test.ts drizzle lib/types.ts
git commit -m "feat: define canonical Saathi data model"
```

### Task 3: Replace custom authentication with Supabase Auth

**Files:**
- Create: `lib/data/profiles.ts`
- Create: `lib/data/profiles.test.ts`
- Create: `proxy.ts`
- Create: `app/auth/callback/route.ts`
- Create: `app/(auth)/forgot-password/page.tsx`
- Create: `app/(auth)/reset-password/page.tsx`
- Modify: `lib/auth-simple.ts`
- Modify: `lib/session-boundary.ts`
- Modify: `lib/session-boundary.test.ts`
- Modify: `components/auth-form.tsx`
- Modify: `components/auth-form.test.cjs`

**Interfaces:**
- Produces: cookie-backed Supabase signup/login/logout/confirmation/recovery and `requireUser(): Promise<{ id: string; email: string; username: string }>`.
- Consumes: Supabase Auth clients and the `profiles` table.

- [ ] **Step 1: Add failing Auth and profile-boundary tests**

Cover signup metadata, profile creation, login failure, logout, callback exchange, password recovery, expired session, cookie refresh, and a missing-profile repair result. Assert that no custom password hash or Redis session is created.

- [ ] **Step 2: Run focused authentication tests**

Run: `node --experimental-strip-types --test lib/data/profiles.test.ts lib/session-boundary.test.ts components/auth-form.test.cjs`

Expected: new tests fail against the custom Redis authentication path.

- [ ] **Step 3: Implement Supabase Auth and profile synchronization**

Use `signUp`, `signInWithPassword`, `signOut`, `resetPasswordForEmail`, and PKCE callback exchange through Supabase. Add the tested `auth.users` trigger that inserts `profiles(id, username)`. Implement `requireUser()` with verified server claims and a profile lookup. Remove custom password and Redis-session writes after the Supabase tests pass.

- [ ] **Step 4: Verify authentication behavior**

Run: `node --experimental-strip-types --test lib/data/profiles.test.ts lib/session-boundary.test.ts components/auth-form.test.cjs`

Run: `npm run type-check`

Expected: focused tests and type-check pass.

- [ ] **Step 5: Commit account persistence**

```powershell
git add lib/data/profiles.ts lib/data/profiles.test.ts proxy.ts app/auth/callback/route.ts 'app/(auth)/forgot-password/page.tsx' 'app/(auth)/reset-password/page.tsx' lib/auth-simple.ts lib/session-boundary.ts lib/session-boundary.test.ts components/auth-form.tsx components/auth-form.test.cjs
git commit -m "feat: adopt Supabase authentication"
```

### Task 4: Implement transactional workspace and membership commands

**Files:**
- Create: `lib/data/workspaces.ts`
- Create: `lib/data/workspaces.test.ts`
- Modify: `lib/workspace-policy.ts`
- Modify: `app/actions/workspaces.ts`
- Modify: `hooks/use-workspaces.ts`

**Interfaces:**
- Produces: `listWorkspacesForUser(userId)`, `getWorkspaceForMember(workspaceId, userId)`, `createWorkspaceForOwner(input, actor)`, `updateWorkspaceForOwner(id, input, expectedVersion, actor)`, `transferOwnership(id, nextOwnerId, actor)`, `archiveWorkspace(id, expectedVersion, actor)`.
- Consumes: canonical schema and user identity from Task 3.

- [ ] **Step 1: Write failing domain tests**

Cover owner membership creation, duplicate membership rejection, member read access, member update denial, metadata validation, stale version conflict, ownership transfer, archive behavior, and one activity/outbox row per successful command.

- [ ] **Step 2: Run focused tests and confirm Redis coupling fails them**

Run: `node --experimental-strip-types --test lib/data/workspaces.test.ts`

- [ ] **Step 3: Implement workspace transactions**

Use explicit functions rather than a generic repository. Each command starts a transaction, queries authorization inside it, mutates rows with version checks, writes activity/outbox rows, and returns `MutationResult<T>`. Refactor server actions into validation/session adapters around these functions.

- [ ] **Step 4: Verify workspace boundaries**

Run: `node --experimental-strip-types --test lib/data/workspaces.test.ts lib/workspace-intent-service.test.ts`

Run: `npm run type-check`

Expected: no workspace durable reads or writes use `redis.get("workspace:...")` or `redis.set("workspace:...")`.

- [ ] **Step 5: Commit workspace persistence**

```powershell
git add lib/data/workspaces.ts lib/data/workspaces.test.ts lib/workspace-policy.ts app/actions/workspaces.ts hooks/use-workspaces.ts
git commit -m "feat: make workspace mutations transactional"
```

### Task 5: Move task persistence and assignment constraints to PostgreSQL

**Files:**
- Create: `lib/data/tasks.ts`
- Create: `lib/data/tasks.test.ts`
- Modify: `app/tasks/actions.ts`
- Modify: `app/tasks/contract.ts`
- Modify: `app/tasks/contract.test.ts`
- Modify: `lib/task-draft.ts`
- Modify: `lib/task-draft.test.ts`

**Interfaces:**
- Produces: `listTasks`, `createTask`, `updateTask`, `deleteTask`, each returning canonical task projections and `MutationResult` failures.
- Consumes: workspace membership and schema from Tasks 2 and 4.

- [ ] **Step 1: Write failing task persistence tests**

Cover required title, statuses, priorities, due timestamp, estimate range, non-member assignment rejection, creator/owner permissions, assignee completion permission, optimistic conflict, and atomic activity/outbox creation.

- [ ] **Step 2: Run focused tests and record expected failures**

Run: `node --experimental-strip-types --test lib/data/tasks.test.ts app/tasks/contract.test.ts lib/task-draft.test.ts`

- [ ] **Step 3: Implement canonical task commands**

Remove `completed`, `dueDate`, and duplicate `assignedTo` persistence. Map UI date/time input to `dueAt` before the data boundary. Use `WHERE id = ? AND version = ?` updates and the composite membership foreign key for assignees.

- [ ] **Step 4: Verify task behavior**

Run: `node --experimental-strip-types --test lib/data/tasks.test.ts app/tasks/contract.test.ts lib/task-draft.test.ts lib/task-overview.test.ts`

Run: `npm run type-check`

Expected: all focused tests pass and Redis contains no durable task records.

- [ ] **Step 5: Commit task persistence**

```powershell
git add lib/data/tasks.ts lib/data/tasks.test.ts app/tasks/actions.ts app/tasks/contract.ts app/tasks/contract.test.ts lib/task-draft.ts lib/task-draft.test.ts
git commit -m "feat: persist tasks with relational constraints"
```

### Task 6: Make invitation creation and acceptance transactional

**Files:**
- Create: `lib/data/invitations.ts`
- Create: `lib/data/invitations.test.ts`
- Modify: `app/actions/invitations.ts`
- Modify: `app/actions/invitation-contract.test.cjs`
- Modify: `lib/invitation-domain.ts`
- Modify: `lib/invitation-domain.test.ts`
- Modify: `components/member-manager.tsx`

**Interfaces:**
- Produces: `createInvitation`, `acceptInvitation`, `declineInvitation`, `revokeInvitation`, and stable duplicate/conflict result codes.
- Consumes: PostgreSQL membership, Upstash Ratelimit, and the mutation result contract.

- [ ] **Step 1: Write failing concurrency and invariant tests**

Cover existing-member invitation, two simultaneous pending invitations, wrong recipient, expiry, concurrent acceptance, repeated acceptance, decline/revoke terminal states, and one membership/activity/outbox result.

- [ ] **Step 2: Run focused invitation tests**

Run: `node --experimental-strip-types --test lib/data/invitations.test.ts lib/invitation-domain.test.ts app/actions/invitation-contract.test.cjs`

Expected: transaction and constraint cases fail against Redis JSON membership.

- [ ] **Step 3: Implement invitation transactions**

Use `@upstash/ratelimit` with separate prefixes for owner, workspace, and recipient limits. Use a PostgreSQL transaction and row lock for acceptance. Map the pending unique-index violation to the existing pending invitation. Use membership `ON CONFLICT DO NOTHING`, but append accepted activity/outbox only when the state transition succeeds.

- [ ] **Step 4: Verify safe public errors**

Run: `node --experimental-strip-types --test lib/data/invitations.test.ts lib/invitation-domain.test.ts app/actions/invitation-contract.test.cjs components/member-manager.test.cjs`

Expected: inviting an existing member returns one inline `DUPLICATE` message and no generic Server Components error or duplicate toast.

- [ ] **Step 5: Commit invitation persistence**

```powershell
git add lib/data/invitations.ts lib/data/invitations.test.ts app/actions/invitations.ts app/actions/invitation-contract.test.cjs lib/invitation-domain.ts lib/invitation-domain.test.ts components/member-manager.tsx
git commit -m "fix: enforce invitation invariants in PostgreSQL"
```

### Task 7: Deliver transactional outbox events through existing Redis Streams

**Files:**
- Create: `lib/data/outbox.ts`
- Create: `lib/data/outbox.test.ts`
- Create: `app/api/internal/outbox/route.ts`
- Create: `lib/outbox-delivery.ts`
- Create: `lib/outbox-delivery.test.ts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `lib/realtime.ts`
- Modify: `lib/realtime-sse.ts`
- Modify: `hooks/useRealtime.ts`

**Interfaces:**
- Produces: `publishOutboxEvent(eventId)`, a QStash-authenticated `publishPendingOutboxEvents(limit)`, and event payloads carrying stable `eventId` and aggregate version.
- Consumes: outbox rows and current Redis Stream publisher.

- [ ] **Step 1: Write failing delivery tests**

Cover publish success, Redis failure retaining an unpublished row, duplicate retry, bounded batch delivery, safe error category persistence, SSE event ID propagation, and client refetch on version advance.

- [ ] **Step 2: Run focused realtime tests**

Run: `node --experimental-strip-types --test lib/data/outbox.test.ts lib/outbox-delivery.test.ts lib/realtime-sse.test.ts hooks/useSSE.test.cjs`

- [ ] **Step 3: Implement outbox delivery**

After a domain transaction commits, attempt `publishOutboxEvent`. Upstash QStash invokes the retry route with signature verification, retries, and deduplication. The route claims at most 50 unpublished rows using `FOR UPDATE SKIP LOCKED`, publishes each stable event ID, and marks successes published. SSE clients refetch PostgreSQL projections rather than treating stream payloads as durable truth.

- [ ] **Step 4: Verify failure recovery**

Run: `node --experimental-strip-types --test lib/data/outbox.test.ts lib/outbox-delivery.test.ts lib/realtime-sse.test.ts hooks/useSSE.test.cjs`

Run: `npm run type-check`

Expected: a simulated Redis outage leaves retryable outbox rows and committed PostgreSQL state.

- [ ] **Step 5: Commit realtime reliability**

```powershell
git add lib/data/outbox.ts lib/data/outbox.test.ts app/api/internal/outbox/route.ts lib/outbox-delivery.ts lib/outbox-delivery.test.ts lib/realtime.ts lib/realtime-sse.ts hooks/useRealtime.ts package.json package-lock.json .env.example
git commit -m "feat: publish realtime events from a durable outbox"
```

### Task 8: Make dashboard states explicit and add workspace settings

**Files:**
- Create: `lib/dashboard-state.ts`
- Create: `lib/dashboard-state.test.ts`
- Create: `components/dashboard-content.tsx`
- Create: `components/workspace-settings.tsx`
- Create: `components/workspace-settings.test.cjs`
- Modify: `app/dashboard/page.tsx`
- Modify: `hooks/use-workspaces.ts`
- Modify: `components/workspace-overview.tsx`
- Modify: `components/workspace-create-form.tsx`

**Interfaces:**
- Produces: `resolveDashboardState(input): DashboardState` and owner-only workspace settings using `updateWorkspace(workspaceId, input, expectedVersion)`.
- Consumes: PostgreSQL workspace projections and mutation contracts.

- [ ] **Step 1: Write the failing dashboard state table test**

```ts
assert.equal(resolveDashboardState({ auth: "ready", workspaces: "loading", items: [] }).kind, "workspace-loading")
assert.equal(resolveDashboardState({ auth: "ready", workspaces: "error", items: [] }).kind, "workspace-error")
assert.equal(resolveDashboardState({ auth: "ready", workspaces: "ready", items: [] }).kind, "zero-workspaces")
```

Also assert that only owners see settings and that settings submit name, summary, target time, timezone, and expected version.

- [ ] **Step 2: Run focused UI contract tests**

Run: `node --experimental-strip-types --test lib/dashboard-state.test.ts components/workspace-settings.test.cjs app/dashboard/dashboard-recovery.test.cjs`

Expected: FAIL because the page currently interprets initial `[]` as zero workspaces.

- [ ] **Step 3: Implement the state resolver and settings sheet**

Make `useWorkspaces` expose `{ status: "idle" | "loading" | "ready" | "error", workspaces, error }`. Render `WorkspaceCreateForm` only for `zero-workspaces` or explicit creation. Render `PageLoader`/skeleton for workspace loading. Add a Settings action to the workspace header and use the existing Sheet/Input/Textarea controls.

- [ ] **Step 4: Verify state and settings behavior**

Run: `node --experimental-strip-types --test lib/dashboard-state.test.ts components/workspace-settings.test.cjs app/dashboard/dashboard-recovery.test.cjs lib/data/workspaces.test.ts`

Run: `npm run lint`

Run: `npm run type-check`

Expected: loaders never contain intention-form copy; owner updates refresh the projection; members have no edit action; conflicts preserve the draft and offer reload.

- [ ] **Step 5: Commit dashboard behavior**

```powershell
git add lib/dashboard-state.ts lib/dashboard-state.test.ts components/dashboard-content.tsx components/workspace-settings.tsx components/workspace-settings.test.cjs app/dashboard/page.tsx hooks/use-workspaces.ts components/workspace-overview.tsx components/workspace-create-form.tsx
git commit -m "feat: add explicit dashboard states and workspace settings"
```

### Task 9: Execute the one-time cutover and remove durable Redis paths

**Files:**
- Create: `scripts/verify-postgres-cutover.ts`
- Create: `scripts/verify-postgres-cutover.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `app/actions/migration.ts`
- Modify: `lib/redis.ts`
- Create: `docs/release/2026-09-04-postgres-cutover.md`

**Interfaces:**
- Produces: `npm run verify:cutover`, a sanitized evidence report, and a codebase with no durable Redis workspace/user/task/invitation writes.
- Consumes: all earlier tasks.

- [ ] **Step 1: Write a failing static cutover test**

Scan application source and fail on durable legacy patterns including `redis.set("workspace:`, `redis.get("workspace:`, `redis.set(taskId`, `user:${email}:workspaces`, Redis user/session records, and Redis invitation records, while allowing rate-limit, claim, presence, and stream keys.

- [ ] **Step 2: Run the cutover test and capture the legacy matches**

Run: `node --experimental-strip-types --test scripts/verify-postgres-cutover.test.ts`

Expected: FAIL and list the remaining durable Redis call sites.

- [ ] **Step 3: Remove the legacy persistence and migration action**

Delete obsolete durable methods only after all callers use Supabase Auth/PostgreSQL. Keep Upstash methods required by rate limits, presence, TTL claims, QStash integration, and Streams. Add `verify:cutover` to package scripts and document Supabase Auth/database variables, Upstash variables, migration, rollback, regional placement, and local Supabase CLI setup.

- [ ] **Step 4: Validate locally and in preview before reset**

Run: `npm run test`

Run: `npm run lint`

Run: `npm run type-check`

Run: `npm run build`

Run: `npm run db:check`

Run: `npm run verify:cutover`

Then verify in preview with two accounts: signup/login, zero-workspace loader transition, create/edit workspace, duplicate invite, accept invite, task create/edit/assign/complete/delete, SSE update, forced reconnect, and mobile layout.

- [ ] **Step 5: Perform the controlled production cutover**

Record the previous release SHA and migration output without credentials. Apply migrations to Supabase with `DATABASE_MIGRATION_URL`, deploy with the Supabase transaction-pooler `DATABASE_URL` and existing Upstash variables, and leave old Redis durable keys untouched. Record timestamps and observable results in the release evidence document.

- [ ] **Step 6: Commit cutover tooling and documentation**

```powershell
git add scripts/verify-postgres-cutover.ts scripts/verify-postgres-cutover.test.ts package.json README.md app/actions/migration.ts lib/redis.ts docs/release/2026-09-04-postgres-cutover.md
git commit -m "chore: complete PostgreSQL persistence cutover"
```

## Final acceptance gate

- PostgreSQL migration and constraint tests pass.
- No durable profile/workspace/member/invitation/task/activity record is written to Redis.
- Supabase Auth signup, confirmation, login, recovery, refresh, and logout work.
- Upstash limits, claims, presence, QStash delivery, and Streams continue working.
- The intention chatbox is impossible during authentication or workspace loading.
- Owners can edit complete workspace metadata with conflict handling.
- Duplicate membership and pending invitations are prevented transactionally.
- Task assignment cannot reference a non-member.
- Realtime publication failures are retryable from the outbox.
- Full tests, lint, type-check, build, desktop/mobile, two-user, reconnect, and preview checks have dated evidence.
- Production cutover retains a known rollback release and does not delete old Redis keys.

## Ticket graph

Each task above is one agent-ready ticket. Publish them with the `ready-for-agent` label and these blocking edges:

| Ticket | Title | Blocked by | Can run alongside |
|---|---|---|---|
| SAATHI-DB-01 | Add Supabase Auth, PostgreSQL, and local-stack foundation | None | None |
| SAATHI-DB-02 | Define the canonical schema and invariants | DB-01 | None |
| SAATHI-AUTH-01 | Replace custom authentication with Supabase Auth | DB-01, DB-02 | None |
| SAATHI-WS-01 | Implement transactional workspace and membership commands | DB-02, AUTH-01 | None |
| SAATHI-TASK-01 | Persist tasks with relational constraints | WS-01 | INV-01, UI-01 |
| SAATHI-INV-01 | Make invitation creation and acceptance transactional | WS-01 | TASK-01, UI-01 |
| SAATHI-RT-01 | Deliver outbox events through Upstash Streams and QStash | TASK-01, INV-01 | UI-01 after WS-01 |
| SAATHI-UI-01 | Add explicit dashboard states and workspace settings | WS-01 | TASK-01, INV-01, RT-01 |
| SAATHI-CUTOVER-01 | Execute and verify the one-time cutover | AUTH-01, TASK-01, INV-01, RT-01, UI-01 | None |

Work blockers-first. TASK-01, INV-01, and UI-01 may be developed independently after WS-01, but integrate them sequentially into the same branch to avoid shared-file conflicts in `hooks/use-workspaces.ts` and `app/dashboard/page.tsx`.
