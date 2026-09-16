# Saathi v1 Core Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a standard, permission-safe collaboration loop: workspace, task, comment, realtime reconciliation, and grounded AI advice.

**Architecture:** Keep the existing Next.js modular monolith. PostgreSQL is the durable source of truth; Server Actions own authorization and transactions; activity and outbox rows commit with every durable mutation; Redis/SSE causes client reconciliation only. Retain the existing Groq structured-response client behind a Saathi assistant adapter, with no raw prompt or answer persistence.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Drizzle ORM, PostgreSQL/Supabase Auth, Upstash Redis Streams, SSE, Groq structured responses, Node test runner, Tailwind/shadcn primitives.

**Spec:** `docs/product/saathi-v1-product-requirements.md`; `docs/architecture/saathi-v1-technical-architecture.md`

## Global Constraints

- A task is one independently actionable outcome in exactly one workspace; no projects, subtasks, labels, custom fields, attachments, or multiple assignees.
- Task state is exactly `todo`, `in_progress`, or `done`; `blocked` remains advisory AI output only.
- A task has either `dueDate` or `dueAt`, never both; `bucket` is a non-authoritative `today`/`next` view.
- Every workspace read, command, comment, subscription, and AI request verifies current membership server-side.
- The owner is always a member; invitations are not membership until accepted by the intended authenticated user.
- AI has one server-only provider adapter, returns advice or reviewable proposals, and cannot persist a change without a separately authorized deterministic command.
- Store AI operational metadata only for 30 days: workspace ID, requesting user ID, capability, result category, latency, estimated cost, timestamp. Store no raw prompt, task context, or provider response.
- No browser data access to domain tables. Do not add new runtime dependencies unless the approved implementation cannot use the installed stack.

---

## File structure and delivery order

| Delivery | Main files | Responsibility |
| --- | --- | --- |
| Canonical task contract | `app/tasks/contract.ts`, `app/tasks/actions.ts`, task editor/list components | Remove unsupported client-only task fields and preserve validated task facts end-to-end. |
| Comments | migration, `lib/data/comments.ts`, `app/actions/comments.ts` | Durable append-only task discussion with membership authorization. |
| Realtime/activity | `lib/realtime.ts`, `hooks/useRealtime.ts`, workspace hook | Notify clients to reload comments/activity after committed comment mutation. |
| Task detail UI | new `components/task-detail-panel.tsx` | Make task facts, comments, activity, conflict, and permissions visible. |
| AI advisor | new assistant adapter/action/components | Read a minimum authorized projection, return structured advice, log bounded metadata, and require explicit command confirmation. |
| Verification/release | tests, build, preview checks | Prove ownership, transactions, errors, reconciliation, and browser flows before promotion. |

### Task 1: Reconcile the canonical task contract

**Files:**
- Modify: `app/tasks/actions.ts`
- Modify: `app/tasks/contract.ts`
- Modify: `components/task-editor.tsx`
- Modify: `components/task-card.tsx`
- Modify: `components/task-list.tsx`
- Modify: `lib/task-draft.ts`
- Modify: `lib/task-draft.test.ts`
- Test: `app/tasks/contract.test.ts`

**Interfaces:**
- Consumes: `TaskUpdate`, `Task`, `updateTask`, and `useWorkspaces.editTask`.
- Produces: one `Task` client contract containing only persisted canonical task fields; a UI editor that submits `TaskUpdate` only.

- [ ] **Step 1: Write failing contract tests for forbidden fields and mutually exclusive deadlines.**

```ts
test("rejects UI-only categories and two deadline representations", () => {
  assert.equal(normalizeTaskUpdates({ categories: ["frontend"] }).error, "Unrecognized key(s) in object: 'categories'")
  assert.equal(normalizeTaskUpdates({ dueDate: "2026-10-01", dueAt: "2026-10-01T09:00:00Z" }).error, "Use either a due date or due time")
})
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `node --experimental-strip-types --test app/tasks/contract.test.ts`  
Expected: FAIL because the deadline exclusivity rule does not yet exist.

- [ ] **Step 3: Add deadline exclusivity to `taskUpdateSchema` and remove `categories`/`assignedTo` from `Task`.**

```ts
.superRefine((value, context) => {
  if (value.dueDate && value.dueAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Use either a due date or due time", path: ["dueAt"] })
  }
})
```

Make the editor render title, description, status, priority, assignee, one deadline control, estimate, and bucket. Delete the category input and any callback that sends it.

- [ ] **Step 4: Run focused task contract and draft tests.**

Run: `node --experimental-strip-types --test app/tasks/contract.test.ts lib/task-draft.test.ts`  
Expected: PASS.

- [ ] **Step 5: Inspect the caller graph and commit the isolated contract slice.**

Run: `rg -n "categories|assignedTo" app components hooks lib --glob '!**/*.test.*'`  
Expected: no task-editing path sends either field.

Commit after approval: `git add app/tasks/contract.ts app/tasks/actions.ts components/task-editor.tsx components/task-card.tsx components/task-list.tsx lib/task-draft.ts lib/task-draft.test.ts app/tasks/contract.test.ts && git commit -m "fix: align task UI with canonical task fields"`

### Task 2: Add durable append-only task comments

**Files:**
- Create: migration generated with `supabase migration new task_comments`
- Modify: `lib/db/schema.ts`
- Create: `lib/data/comments.ts`
- Create: `lib/data/comments.test.ts`
- Modify: `lib/data/collaboration.test.ts`
- Modify: `lib/realtime.ts`

**Interfaces:**
- Consumes: `getDb`, `Transaction`, `appendDomainEvent`, `TaskError`, and workspace membership rows.
- Produces: `listTaskComments(actorId, taskId)` and `createTaskComment(actorId, taskId, body)`; event type `task-comment-created`.

- [ ] **Step 1: Write database tests before the migration.**

```ts
await assert.rejects(createTaskComment(outsider.id, task.id, "I should not see this"), /access denied/i)
const comment = await createTaskComment(member.id, task.id, "Blocked by review")
assert.equal(comment.body, "Blocked by review")
assert.equal((await db`SELECT id FROM activity_events WHERE entity_id=${comment.id} AND event_type='task-comment-created'`).length, 1)
```

- [ ] **Step 2: Run the focused test and confirm it fails because the API/table does not exist.**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none --test-force-exit lib/data/comments.test.ts`  
Expected: FAIL with module or relation-not-found error.

- [ ] **Step 3: Create and apply the local migration.**

The migration must create:

```sql
CREATE TABLE task_comments (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES profiles(id),
  body varchar(2000) NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_created_idx ON task_comments(task_id, created_at);
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON task_comments FROM anon, authenticated;
```

Use the existing migration runner for the local test database. Do not add public Data API policies.

- [ ] **Step 4: Implement the data boundary as one transaction.**

`createTaskComment` must lock the task, verify that it is in an unarchived workspace, verify current membership, insert the comment, call `appendDomainEvent` with entity type `task_comment`, and invoke `flushOutbox` only after commit. `listTaskComments` must verify membership before reading ordered comments.

- [ ] **Step 5: Extend the realtime schema and run focused database tests.**

Add `task-comment-created` to `RealtimeEventType` and `realtimeEventSchema`.

Run: `npm run test:database`  
Expected: PASS, including comment authorization, transaction rollback, assignment containment, and invitation tests.

- [ ] **Step 6: Inspect the generated migration and commit the data slice.**

Run: `npm run db:check && git diff --check`  
Expected: PASS.

Commit after approval: `git add drizzle lib/db/schema.ts lib/data/comments.ts lib/data/comments.test.ts lib/data/collaboration.test.ts lib/realtime.ts && git commit -m "feat: add permission-safe task comments"`

### Task 3: Expose comments through a server action and reconcile them in realtime

**Files:**
- Create: `app/actions/comments.ts`
- Create: `app/actions/comments.test.ts`
- Modify: `hooks/useRealtime.ts`
- Modify: `hooks/use-workspaces.ts`
- Modify: `app/tasks/actions.ts`

**Interfaces:**
- Consumes: `createTaskComment`, `listTaskComments`, `getSession`, rate-limit helpers, and `task-comment-created` events.
- Produces: `getTaskComments(taskId)` and `addTaskComment(taskId, body)` action results plus `useWorkspaces.refreshTaskComments(taskId)`.

- [ ] **Step 1: Write action tests for session, member authorization, validation, and success.**

```ts
assert.deepEqual(await addTaskComment("task-id", "   "), { error: "Comment is required" })
assert.deepEqual(await addTaskComment("task-id", "A clear update"), { success: true, comment: expectedComment })
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `node --experimental-strip-types --test app/actions/comments.test.ts`  
Expected: FAIL because the action does not exist.

- [ ] **Step 3: Implement actions with the same session-derived identity and error shape as task actions.**

Use a `z.string().trim().min(1).max(2000)` body schema. Rate-limit creation with a workspace-scoped key. Call `revalidatePath("/dashboard")` after success. Do not accept user ID, workspace ID, or provider data from the browser beyond the task ID and comment body.

- [ ] **Step 4: Have `useRealtime` expose a comment callback and make the workspace hook refetch only the open task's comments.**

```ts
onTaskCommentCreated: (event) => {
  if (event.workspaceId === currentWorkspaceId && event.data.taskId === openTaskId) {
    void refreshTaskComments(openTaskId)
  }
}
```

Do not refetch the whole workspace for a comment event.

- [ ] **Step 5: Run action and realtime tests.**

Run: `node --experimental-strip-types --test app/actions/comments.test.ts hooks/useSSE.test.cjs lib/realtime-contract.test.ts lib/realtime-sse.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit the action/reconciliation slice.**

Commit after approval: `git add app/actions/comments.ts app/actions/comments.test.ts hooks/useRealtime.ts hooks/use-workspaces.ts app/tasks/actions.ts && git commit -m "feat: reconcile task comments through workspace realtime"`

### Task 4: Build the task-detail experience around canonical task facts

**Files:**
- Create: `components/task-detail-panel.tsx`
- Create: `components/task-detail-panel.test.cjs`
- Modify: `components/task-list.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `hooks/use-workspaces.ts`

**Interfaces:**
- Consumes: canonical `Task`, workspace members, comment actions, and comment projection.
- Produces: an accessible detail panel with task facts, comments, activity signal, permission-aware controls, and conflict/retry feedback.

- [ ] **Step 1: Write a source-level UI contract test.**

```js
assert.match(source, /Task details/)
assert.match(source, /Add comment/)
assert.match(source, /Priority/)
assert.doesNotMatch(source, /Categories/)
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `node --test components/task-detail-panel.test.cjs`  
Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement one accessible detail panel.**

Use the installed `Sheet` or `Dialog` primitive. The panel receives a selected `Task`, current member, member list, `comments`, `onSave`, `onComplete`, `onDelete`, and `onAddComment`. Render title/description/status/priority/assignee/due/estimate/bucket in a deterministic order. Disable controls when the caller lacks permission; do not hide the activity/context that the member may read.

- [ ] **Step 4: Wire list-card selection without duplicating edit forms.**

The board card remains a compact summary. Opening a card sets `openTaskId`; the detail panel owns the full editor and comments. Delete the old category editor rather than maintaining two task editors.

- [ ] **Step 5: Run focused UI tests and type check.**

Run: `node --test components/task-detail-panel.test.cjs components/dashboard-navigation.test.ts && npm run type-check`  
Expected: PASS.

- [ ] **Step 6: Manually verify the desktop and 390px task flow.**

Verify create → assign → edit → comment → complete, a member's restricted edit controls, a stale save conflict, and comment refresh in a second browser session.

- [ ] **Step 7: Commit the task-detail slice.**

Commit after approval: `git add components/task-detail-panel.tsx components/task-detail-panel.test.cjs components/task-list.tsx app/dashboard/page.tsx hooks/use-workspaces.ts && git commit -m "feat: add canonical task detail and discussion"`

### Task 5: Add a bounded AI advisor using the existing Groq client

**Files:**
- Create: `lib/ai/workspace-advisor.ts`
- Create: `lib/ai/workspace-advisor.test.ts`
- Create: `lib/data/ai-operations.ts`
- Create: `app/actions/workspace-advisor.ts`
- Create: `app/actions/workspace-advisor.test.ts`
- Modify: `lib/feature-flags.ts`
- Modify: `lib/env.ts`

**Interfaces:**
- Consumes: `requestGroqStructuredResponse`, verified session, membership checks, and a minimum workspace/task/comment read projection.
- Produces: `askWorkspaceAdvisor(workspaceId, capability)` returning either an advisory answer or a validated proposal; a 30-day operational metadata record without content.

- [ ] **Step 1: Write failing advisor contract tests.**

```ts
assert.throws(() => parseAdvisorResponse({ summary: "x", proposal: { action: "delete_task" } }), /unsupported/i)
assert.deepEqual(buildAdvisorProjection(workspace), {
  workspace: { name: "Launch" },
  tasks: [{ title: "Ship", status: "todo", priority: "high", dueAt: null, assignee: "member@example.com" }],
})
```

- [ ] **Step 2: Run the advisor unit test and confirm it fails.**

Run: `node --experimental-strip-types --test lib/ai/workspace-advisor.test.ts`  
Expected: FAIL because the adapter and schema do not exist.

- [ ] **Step 3: Implement a purpose-limited advisor schema and server-only adapter.**

Support only `summarize_workspace`, `identify_attention`, and `draft_task`. Use `requestGroqStructuredResponse`; set the existing Groq client as the single v1 provider. A `draft_task` response contains a title, optional description, priority, optional due representation, optional estimate, and no mutation. Parse the provider result locally with Zod before returning it.

- [ ] **Step 4: Persist operational metadata only.**

Create a narrow `ai_operation_logs` table through a reviewed migration with columns `id`, `workspace_id`, `requesting_user_id`, `capability`, `outcome`, `latency_ms`, `estimated_cost_micros`, and `created_at`. Do not add prompt, response, tokens, task IDs, or model message columns. Add an internal cleanup job that deletes rows older than 30 days.

- [ ] **Step 5: Implement the action boundary and tests.**

The action verifies session and current membership before building the projection. It rate-limits `ai-advisor:${userId}:${workspaceId}`. A draft is passed to the existing manual task creation action only after the user confirms it in the UI; the confirmation re-runs normal task Zod validation and authorization.

- [ ] **Step 6: Run focused AI and database tests.**

Run: `node --experimental-strip-types --test lib/groq-chat.test.ts lib/ai/workspace-advisor.test.ts app/actions/workspace-advisor.test.ts && npm run test:database`  
Expected: PASS; provider timeouts or invalid responses create a failure metadata row and no task.

- [ ] **Step 7: Commit the AI advisor backend slice.**

Commit after approval: `git add drizzle lib/ai lib/data/ai-operations.ts app/actions/workspace-advisor.ts app/actions/workspace-advisor.test.ts lib/feature-flags.ts lib/env.ts && git commit -m "feat: add grounded workspace AI advisor"`

### Task 6: Present AI advice and draft review in workspace context

**Files:**
- Create: `components/workspace-advisor.tsx`
- Create: `components/workspace-advisor.test.cjs`
- Modify: `app/dashboard/page.tsx`
- Modify: `components/workspace-overview.tsx`

**Interfaces:**
- Consumes: `askWorkspaceAdvisor`, workspace ID, and existing `onAddTask` callback.
- Produces: a contextual assistant panel that has no autonomous mutation path.

- [ ] **Step 1: Write a UI contract test for safe AI behavior.**

```js
assert.match(source, /Summarize workspace/)
assert.match(source, /Review task draft/)
assert.match(source, /Create task/)
assert.doesNotMatch(source, /autoCreate|autonomous|saveWithoutReview/i)
```

- [ ] **Step 2: Run it and confirm it fails.**

Run: `node --test components/workspace-advisor.test.cjs`  
Expected: FAIL because the contextual panel does not exist.

- [ ] **Step 3: Implement the assistant panel.**

Render capability buttons, pending/error state, an advisory answer, and a review form for a task draft. Place it in workspace overview and task detail context, not as a full-screen chat. The only write control calls the same `onAddTask` path a manual creation uses.

- [ ] **Step 4: Run UI tests and a manual authorization check.**

Run: `node --test components/workspace-advisor.test.cjs && npm run type-check`  
Expected: PASS.

Manual check: a non-member receives a forbidden result and sees no workspace content in the assistant response.

- [ ] **Step 5: Commit the UI slice.**

Commit after approval: `git add components/workspace-advisor.tsx components/workspace-advisor.test.cjs app/dashboard/page.tsx components/workspace-overview.tsx && git commit -m "feat: add contextual workspace AI advisor"`

### Task 7: Complete the core frontend surfaces from the approved design system

**Files:**
- Modify: `app/landing/page.tsx`
- Modify: `app/guide/page.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/register/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: shared public/auth components only where both pages use the same pattern
- Test: existing page source tests plus focused route/browser checks

**Interfaces:**
- Consumes: existing logo component, semantic design tokens, auth contracts, and dashboard domain components.
- Produces: responsive public/auth/dashboard pages with the existing logo unchanged and no changes to auth or domain mutation contracts.

- [ ] **Step 1: Capture approved reference screenshots for landing, guide, login, register, dashboard, and task detail.**

Save reference images outside `public/` under the existing design-output folder. Record desktop and 390px variants. Do not use generated artwork as a replacement for the current Saathi logo.

- [ ] **Step 2: Write source tests for one primary action and shared logo usage on each public/auth route.**

```js
assert.match(source, /SaathiLogo/)
assert.match(source, /href="\/register"|router\.push\("\/register"\)/)
```

- [ ] **Step 3: Implement page-by-page, preserving behavior.**

Landing and guide: clear product outcome and an honest workflow explanation. Login/register: one focused form and recovery links. Dashboard: board-first composition with Team and connection context secondary. Reuse existing shadcn primitives and semantic tokens; do not replace the logo or add a UI library.

- [ ] **Step 4: Run the existing public/dashboard tests, then browser verification.**

Run: `npm test`  
Expected: PASS.

Manual browser matrix: unauthenticated public routes, valid/invalid login, registration validation, dashboard loading/error/empty/ready states, task detail mobile, keyboard focus, and 390px horizontal-overflow check.

- [ ] **Step 5: Commit each independently reviewable route group.**

Commit after approval: `git add app/landing app/guide components/landing* components/guide* && git commit -m "feat: finalize public product surfaces"`

Commit after approval: `git add app/login app/register components/auth* components/password-recovery* && git commit -m "feat: finalize authentication surfaces"`

### Task 8: Release evidence and deployment repair

**Files:**
- Modify only if required: `proxy.ts` after migrating the deprecated `middleware.ts` convention
- Modify: `.env.example` or deployment documentation for required Preview environment variables
- Modify: `docs/release/` with dated verification evidence

**Interfaces:**
- Consumes: finalized domain/frontend behavior and Vercel Preview configuration.
- Produces: a passing preview deployment and truthful release evidence.

- [ ] **Step 1: Write or update a regression test for the renamed Next.js proxy export.**

The test must verify the existing `/dashboard` authentication behavior after the file/function rename from `middleware` to `proxy`.

- [ ] **Step 2: Make the minimal Next.js convention migration.**

Rename `middleware.ts` to `proxy.ts` and export `proxy(request)`, preserving the matcher. Use the current official Next.js migration guidance and do not alter authorization logic during this change.

- [ ] **Step 3: Validate preview configuration without exposing values.**

Ensure Preview has `NEXT_PUBLIC_APP_URL` set to the intended preview origin, alongside the already-required validation variables. Do not print values. Redeploy only after the user authorizes the external configuration change.

- [ ] **Step 4: Run final local validation.**

Run: `npm run test:database && npm test && npm run type-check && npm run lint && npm run build && git diff --check`  
Expected: PASS.

- [ ] **Step 5: Run two-user and hosted checks.**

Verify owner create → invite → accept → assign → comment → complete → reconnect; check unauthorized workspace, comment, and AI requests; inspect Vercel runtime logs for server errors. Record results and limits in `docs/release/`.

- [ ] **Step 6: Create a final reviewable release commit and request external publish approval.**

Commit after approval: stage only reviewed files and use `git commit -m "feat: complete Saathi v1 collaboration loop"`. Push, PR update, Vercel environment changes, and deployment require separate explicit user approval.

## Plan self-review

| Spec requirement | Delivering task |
| --- | --- |
| Standard task facts and no arbitrary parameters | Task 1 |
| Immutable task comments and retention rule | Tasks 2–4 |
| Owner/member/invitation/task authorization | Tasks 2–5 and final two-user checks |
| Durable activity/outbox and realtime reconciliation | Tasks 2–3 |
| Grounded, non-autonomous AI and 30-day metadata retention | Tasks 5–6 |
| Approved public/auth/dashboard design work | Task 7 |
| Proxy deprecation and Preview deployment failure | Task 8 |

The plan deliberately leaves projects, organizations, subtasks, labels, custom fields, comment editing, provider conversation history, and autonomous AI outside v1.
