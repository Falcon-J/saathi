# Saathi v1 product requirements

**Status:** Draft for product review
**Date:** 2026-09-11
**Decision:** A task is one independently actionable outcome, normally owned by one member and completable within a few days.

## 1. Product outcome

Saathi helps a small team turn a shared outcome into visible, assigned, and completed work. A team should be able to create a workspace, invite a teammate, plan work, execute it, understand what changed, and ask AI for grounded help without adopting a heavyweight project-management process.

## 2. Target user and boundary

The v1 user is a small product, engineering, operations, or student team. A **workspace** is the collaboration and authorization boundary for one meaningful outcome. It is not an organization hierarchy, a portfolio-management system, or a generalized project-management database.

The v1 work hierarchy is deliberately flat:

`workspace → task`

A workspace captures the shared goal. A task captures a deliverable action. Larger initiatives belong in a separate workspace until real user evidence requires projects, milestones, or subtasks.

## 3. Functional requirements

### FR-1 Identity and access

- A user authenticates through Supabase Auth and has one Saathi profile.
- A workspace has exactly one owner and zero or more members.
- The owner is always a member.
- Only the owner can change workspace metadata, invite or remove members, archive, delete, or transfer ownership.
- Every workspace read, mutation, realtime subscription, comment, activity query, and AI request must enforce current membership.

### FR-2 Workspace lifecycle

- A user can create a workspace with a name, optional summary, optional target date/time, and IANA timezone.
- Creation atomically creates the workspace, owner membership, initial activity, and delivery event.
- An owner can edit workspace metadata with optimistic concurrency.
- Archiving hides a workspace from daily work while retaining its history. Permanent deletion is a separate, confirmed owner action.

### FR-3 Membership and invitations

- An owner invites one normalized email address to one workspace.
- An invitation is pending for seven days and can be accepted, declined, revoked, or expired.
- There can be at most one pending invitation for an email in a workspace.
- An invitee may create an account from the invitation link, but can accept only after signing in with the invited email address.
- Email delivery is best-effort; the durable invitation record is authoritative and the owner can copy the invitation link when delivery is unavailable.
- Acceptance verifies the authenticated invitee, creates membership once, records activity once, and is safe to retry.
- Removing a member unassigns their open tasks. The owner cannot remove themself without first transferring ownership.

### FR-4 Task lifecycle

- A task belongs to exactly one workspace and is created by one member.
- Required task fields are `title`, `status`, `priority`, and `createdBy`.
- Optional planning fields are `description`, `assignee`, `due`, `estimate`, and `execution lane`.
- Valid statuses are `todo`, `in_progress`, and `done`. A task can move backwards when work reopens. `blocked` is not a status in v1; overdue or inactive work may be surfaced as a non-authoritative AI insight.
- Valid priorities are `low`, `medium`, and `high`. Priority expresses relative attention within a workspace; it is not an SLA, escalation level, or substitute for due date.
- A task has either a date-only due date or a precise due instant, never both. An omitted due value means no promised deadline.
- An assignee must be a current member. Exactly one assignee is supported in v1; collaboration is represented through comments and activity, not multi-assignment.
- The task creator or workspace owner can edit or delete. The assignee may complete or reopen their task but cannot change unrelated planning fields.
- Updates use an expected version so a stale edit returns the current task rather than silently overwriting it.

### FR-5 Task discussion and history

- Members can add immutable comments to a task. Comments remain while their workspace exists and are deleted with that workspace.
- Important task and workspace mutations append activity events with actor, action, entity, and safe metadata.
- Activity is an audit projection, never an authorization source.
- v1 does not include attachments, reactions, rich text, arbitrary mentions, or editing/deleting comments.

### FR-6 Daily work experience

- The authenticated home is a workspace board that shows work by status.
- A task card shows title, assignee, priority, due state, and lightweight activity signal.
- Users can create, assign, edit, move, complete, filter, and open a task without leaving the workspace.
- Empty, loading, offline, conflict, permission-denied, and archived states are explicit.

### FR-7 Grounded AI assistant

- AI is an optional v1 capability on the workspace overview.
- It can summarize status, surface blocked or overdue work, answer questions about authorized workspace data, and draft a proposed task.
- AI output is advisory. A user reviews and explicitly confirms every persisted change.
- AI may only read data the requesting member may read. It never grants access, decides permissions, treats inference as a stored fact, or reports a mutation as successful before the deterministic command commits.
- One provider is accessed through a server-only adapter. Each AI interaction records only operational metadata: requesting user, authorized workspace, requested capability, success/failure category, latency, estimated cost, and timestamp.
- Raw prompts, task context, and model responses are not stored by default. Operational metadata is retained for 30 days, then aggregated or deleted. Durable conversation history requires a separate product decision.

## 4. Canonical task record

| Field | Required | Meaning | Rule |
| --- | --- | --- | --- |
| `id` | system | Stable task identity | UUID; immutable |
| `workspaceId` | system | Authorization and containment boundary | Immutable after creation |
| `title` | yes | Concise, actionable outcome | 1–200 characters |
| `description` | no | Context needed to complete the task | Plain text, 1,000 characters initially |
| `status` | yes | Execution state | `todo`, `in_progress`, `done` |
| `priority` | yes | Relative attention | `low`, `medium`, `high`; defaults to `medium` |
| `assigneeUserId` | no | Single accountable executor | Must be a current member |
| `dueDate` or `dueAt` | no | Date-only commitment or exact deadline | Mutually exclusive |
| `estimatedMinutes` | no | Expected focused effort | Integer, 1–1,440 |
| `bucket` | no | Short-horizon planning view | `today` or `next`; never the authoritative status |
| `createdByUserId` | system | Accountability for creation | Immutable member identity |
| `version` | system | Optimistic concurrency control | Positive integer, increments on edit |
| `createdAt`, `updatedAt` | system | Audit timing | Server generated |

No custom fields, severity, story points, labels, sprints, tags, attachments, multiple assignees, or arbitrary status workflows belong in v1. Each is a separate product decision with storage, indexing, permissions, UI, and migration costs.

## 5. Non-functional requirements

### NFR-1 Correctness and consistency

- PostgreSQL is authoritative for durable data.
- A domain mutation, its activity fact, and its outbox event commit in one database transaction.
- Retries for invitation acceptance, outbox delivery, and user-visible mutation requests are idempotent.
- Realtime is delivery-only; clients refetch or reconcile authoritative data after reconnect, missed events, or conflicts.

### NFR-2 Security and privacy

- Identity comes from the verified server session, never client-supplied IDs, email, or role claims.
- Authorization is checked in the same transaction as security-sensitive mutations.
- Browser clients do not access domain tables through the Supabase Data API.
- Secrets, raw database errors, auth tokens, and unnecessary personal data are never logged.
- The system retains only the email needed for an invitation and removes/obscures it according to a future retention policy.

### NFR-3 Usability and accessibility

- Every page has one primary action and explicit feedback for loading, success, failure, conflict, and offline states.
- The responsive web experience supports keyboard operation, visible focus, meaningful labels, and small-screen use.
- Dates are displayed in the workspace timezone; a precise deadline preserves its instant.

### NFR-4 Performance and operations

- The board reads only the selected workspace's active task projection.
- Task, invitation, and AI requests are rate limited by user and workspace where appropriate.
- Outbox failures are observable and safely retryable.
- Backups, retention, alerting, and restore testing are release gates; the product must not claim production reliability before these have owners and evidence.

## 6. Explicit v1 non-goals

- Organizations, departments, projects, portfolios, epics, sprints, or custom workflows. An organization layer is deferred until a customer needs shared members, billing, administration, or cross-workspace visibility.
- Subtasks, task dependencies, multiple assignees, labels, attachments, or custom fields
- Autonomous AI mutations, AI-derived authorization, or unreviewed AI writes
- A native mobile application, broad integrations, billing, or an automation marketplace

## 7. Acceptance scenarios

1. An owner creates a workspace, creates a task, assigns it to a member, and the member completes it.
2. A non-member cannot read, subscribe to, mutate, comment on, or ask AI about that workspace.
3. An invitation accepted twice creates one membership and one acceptance activity event.
4. A task cannot be assigned to a removed or non-member user.
5. Two concurrent task edits surface a conflict; neither update silently destroys the other author's work.
6. An AI summary only includes data the requester may read and any proposed write requires an explicit deterministic confirmation.

## 8. Product decisions deferred for evidence

- Whether task comments need editing, deletion, mentions, or notifications.
- Whether repeated work needs templates or recurrence.
- Whether teams need parent tasks, projects, or dependencies before a flat workspace model becomes limiting.
- AI provider choice, evaluation set, and paid-usage limits.
