# Saathi PostgreSQL Workspace Architecture Design

## Outcome

Saathi has one durable data model that supports workspace settings, memberships, invitations, tasks, audit history, and reliable realtime notification without showing creation UI during loading or requiring repeated database resets.

## Scope

This design covers:

- PostgreSQL schema and constraints;
- Supabase Auth/PostgreSQL and Upstash ownership;
- authenticated domain mutations;
- transactional invitations and task assignment;
- realtime outbox delivery;
- dashboard loading and zero-workspace states;
- owner-only workspace settings;
- one-time cutover and rollback.

It does not add comments, attachments, custom workflows, billing, organization hierarchy, or external email delivery.

## Runtime architecture

```text
Browser
  -> Supabase Auth cookie and PKCE session
  -> Next.js Server Action / Route Handler
    -> verified Supabase Auth user
    -> domain validation and authorization
    -> PostgreSQL transaction
       - mutate durable records
       - append activity event
       - append outbox event
    -> best-effort outbox flush to Redis Stream
  <- typed mutation result

SSE route
  -> authorize membership from PostgreSQL
  -> read Redis Stream
  -> emit notification

Browser on event/reconnect
  -> refetch authoritative PostgreSQL projection
```

The server action reports success only after the PostgreSQL transaction commits. Realtime publication failure does not reverse a committed mutation; the pending outbox row remains retryable.

## Persistence choices

- PostgreSQL 16-compatible schema.
- Drizzle ORM and Drizzle Kit with committed SQL migrations.
- Supabase PostgreSQL is the hosted durable database.
- Supabase Auth owns signup, login, email confirmation, password recovery, refresh-token rotation, and logout.
- `@supabase/ssr` provides separate browser and server clients plus the Next.js proxy responsible for refreshing cookies.
- The Supabase CLI runs PostgreSQL, Auth, Studio, and Mailpit locally; a standalone PostgreSQL Compose service is not maintained.
- `postgres` uses Supabase's transaction-mode pooler through `DATABASE_URL` for Vercel runtime traffic, with `{ prepare: false, max: 1 }`.
- `DATABASE_MIGRATION_URL` uses the direct Supabase connection and is used only by migration and backup tooling. If the operator cannot reach the IPv6 direct endpoint, the Supabase session pooler is the documented migration fallback.
- The runtime connection uses a dedicated least-privilege database role; migrations use the schema-owner role.
- The browser receives only the Supabase project URL and publishable key required for Auth. Database passwords and service-role keys remain server-only.
- The Supabase Data API is not used for Saathi domain mutations. Server Actions and Drizzle own transactional writes.
- Upstash Redis remains the hosted realtime/ephemeral service; the existing in-memory adapter is development-test fallback only.
- UUID primary keys are generated with `crypto.randomUUID()` in application code.
- All timestamps are UTC `timestamptz` values.
- Emails are normalized before persistence and protected by lowercase checks and unique indexes.

## Relational model

### Supabase `auth.users` and Saathi `profiles`

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key and foreign key to `auth.users.id` |
| username | varchar(80) | non-empty |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

Supabase Auth owns email and password data. Product tables reference the Auth UUID through `profiles.id`; they do not duplicate password hashes. A tested signup trigger creates the profile from approved metadata, and a repair command can create a missing profile without creating a second Auth user.

### workspaces

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| name | varchar(100) | non-empty |
| summary | varchar(240) | nullable |
| target_at | timestamptz | nullable |
| timezone | text | valid IANA name, default `UTC` |
| owner_user_id | uuid | references profiles |
| version | integer | starts at 1, positive |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |
| archived_at | timestamptz | nullable |

`owner_user_id` is the only authoritative owner field.

### workspace_members

| Column | Type | Rule |
|---|---|---|
| workspace_id | uuid | references workspace, cascade delete |
| user_id | uuid | references profile |
| joined_at | timestamptz | required |

The composite primary key `(workspace_id, user_id)` prevents duplicate membership. A deferred composite foreign key from `(workspaces.id, workspaces.owner_user_id)` to membership guarantees that the owner is a member while allowing both rows to be created in one transaction. Owner/member labels are derived by comparing a membership user ID with `owner_user_id`; membership does not duplicate a role column.

### workspace_invitations

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| workspace_id | uuid | references workspace, cascade delete |
| inviter_user_id | uuid | references profile |
| invitee_email | text | normalized lowercase |
| status | enum | pending, accepted, declined, revoked, expired |
| expires_at | timestamptz | required |
| responded_at | timestamptz | nullable |
| accepted_by_user_id | uuid | nullable reference to profile |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

A partial unique index on `(workspace_id, invitee_email)` where status is `pending` prevents duplicate pending invitations. Existing membership is checked in the same transaction before invitation creation. Acceptance locks the invitation row, verifies recipient identity and state, inserts membership with conflict handling, transitions the invitation once, and appends one activity/outbox pair.

### tasks

| Column | Type | Rule |
|---|---|---|
| id | uuid | primary key |
| workspace_id | uuid | references workspace, cascade delete |
| title | varchar(200) | non-empty |
| description | varchar(1000) | nullable |
| status | enum | todo, in_progress, done |
| priority | enum | low, medium, high |
| bucket | enum | today, next, nullable |
| due_at | timestamptz | nullable |
| estimated_minutes | integer | nullable, 1 through 1440 |
| assignee_user_id | uuid | nullable |
| created_by_user_id | uuid | references profile |
| version | integer | starts at 1, positive |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

The composite foreign key `(workspace_id, assignee_user_id)` references workspace membership, so a task cannot be assigned outside its workspace. `status` is authoritative; the redundant `completed` boolean is removed. `due_at` is authoritative; redundant date/time fields are removed.

### activity_events

Append-only rows contain ID, workspace, actor, event type, entity type, entity ID, JSON metadata, and creation time. Activity is an audit projection and is never used to authorize a mutation.

### outbox_events

Rows contain ID, workspace, event type, JSON payload, creation time, publication time, attempt count, and last error category. Domain transactions insert outbox rows. Delivery publishes the same event ID to `workspace:{workspaceId}:events`, then marks the row published. Reprocessing the same event ID is safe because clients treat event IDs as deduplication hints and refetch authoritative state.

## Domain mutation contracts

Server actions return a discriminated result:

```ts
type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "VALIDATION" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "DUPLICATE" | "UNAVAILABLE"; message: string; current?: T }
```

Expected versions are required for workspace and task updates. An update uses `WHERE id = ? AND version = ?`, increments the version, and returns `CONFLICT` with current data when no row is updated.

### Workspace commands

- `createWorkspace(input)` creates workspace, owner membership, activity, and outbox atomically.
- `updateWorkspace(workspaceId, input, expectedVersion)` edits name, summary, target time, and timezone for the owner.
- `transferWorkspaceOwnership(workspaceId, nextOwnerUserId)` is a separate owner-only transaction.
- `archiveWorkspace(workspaceId, expectedVersion)` hides a workspace without immediately deleting its audit history.
- Permanent deletion remains a separately confirmed owner action.

### Invitation commands

- Sending to an existing member returns `DUPLICATE` with “This person is already a workspace member.”
- Sending when a pending invitation exists returns the existing pending invitation without creating another notification.
- Accepting an already accepted invitation by the same recipient returns success without duplicate side effects.
- Accepting a terminal, expired, or wrong-recipient invitation returns a stable domain code and safe message.

## UI component ownership

`app/dashboard/page.tsx` composes the page but does not infer state from empty arrays.

- `lib/dashboard-state.ts`: pure state resolver.
- `hooks/use-workspaces.ts`: exposes `status`, data, error, and refresh; it never represents loading as a successful empty list.
- `components/dashboard-content.tsx`: renders exactly one resolved dashboard state.
- `components/workspace-create-form.tsx`: zero-workspace or explicit-create experience only.
- `components/workspace-settings.tsx`: owner-only settings sheet with name, summary, target date/time, and timezone.
- `components/workspace-overview.tsx`: read projection and task overview; no workspace persistence logic.
- `components/member-manager.tsx`: membership and invitation controls; no direct storage knowledge.

## Loading and empty-state acceptance

1. Authentication loading renders `PageLoader`.
2. Workspace loading renders a workspace skeleton or loader.
3. Workspace errors render retry and never render creation controls.
4. The intention chatbox renders only when `status === "ready"` and `workspaces.length === 0`, or when a user with existing workspaces explicitly selects “Start something new.”
5. Task loading renders within an already resolved workspace and never replaces the workspace with onboarding.
6. A stale selected workspace ID resolves to the first accessible workspace or an explicit recovery state, never the zero-workspace state.

## Security and privacy

- Every domain command derives identity from the verified Supabase Auth user; client-supplied email never grants access.
- Workspace authorization is queried within the same transaction as security-sensitive mutations.
- Database errors are mapped to stable public codes; raw SQL, connection, and constraint details remain server-side.
- Auth tokens, database credentials, service-role keys, and password material are never logged.
- Invitation, mutation, and AI limits use Upstash Ratelimit. Supabase Auth owns login abuse controls.
- Upstash credentials and both Supabase database connection strings remain server-only. Only the Supabase URL and publishable Auth key may use a `NEXT_PUBLIC_` prefix.

## Cutover

1. Build and test Supabase Auth/PostgreSQL paths while Redis remains the deployed legacy backend.
2. Create an empty Supabase preview/staging project and run committed migrations through `DATABASE_MIGRATION_URL`.
3. Validate signup confirmation, login, recovery, workspace, membership, invitation, task, outbox, and SSE flows in preview.
4. Record the current Redis-backed release SHA and retain Redis durable keys.
5. Apply migrations to the Supabase production project through the direct migration connection.
6. Switch the deployment to PostgreSQL durable storage during the approved reset window.
7. Verify two-user collaboration and failure recovery.
8. Remove legacy Redis durable code after the rollback window; continue using Redis ephemeral and stream keys.

No automated command deletes production Redis keys. A reset means the new PostgreSQL dataset begins empty.

## Validation evidence

- Migration generation and migration checks pass.
- Schema constraint tests cover duplicate membership, owner membership, pending invitation uniqueness, task assignment, and optimistic concurrency.
- Domain tests cover Supabase identity authorization and invitation idempotency.
- Dashboard state tests prove loaders cannot render the zero-workspace form.
- Workspace settings tests cover owner/member behavior, validation, save, conflict, and retry.
- Full tests, lint, type-check, production build, desktop/mobile browser checks, two-user SSE checks, and deployed logs are recorded separately.
