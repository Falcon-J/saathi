# Saathi Domain Context

## Product purpose

Saathi turns an intended outcome into a shared workspace where people can plan, assign, complete, and follow work together. The workspace is the collaboration and authorization boundary.

## Ubiquitous language

- **User**: a person authenticated by Supabase Auth and represented in Saathi by a profile sharing the Auth user UUID.
- **Workspace**: a goal-oriented container with editable metadata, members, tasks, and activity.
- **Owner**: the single workspace member allowed to edit workspace settings, manage membership, transfer ownership, archive, or delete the workspace.
- **Member**: a user who can read the workspace and participate in its tasks.
- **Invitation**: a time-limited request for one normalized email address to join one workspace.
- **Task**: a unit of work belonging to exactly one workspace.
- **Activity event**: a durable audit fact created by a successful domain mutation.
- **Realtime event**: an ephemeral notification that tells connected clients to refresh authoritative data.
- **Workspace version**: an integer incremented on workspace metadata changes to detect stale edits.
- **Task version**: an integer incremented on task changes to detect stale edits.

## Authoritative ownership

- Supabase Auth owns identity, passwords, verification, recovery, and sessions.
- Supabase PostgreSQL owns profiles, workspaces, membership, invitations, tasks, activity events, and durable outbox events.
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
- `workspace-ready`: a valid workspace is selected; show Overview, Board, or Team content.

## Compatibility decisions

- Existing Redis Streams and SSE event names remain compatible during the persistence transition.
- Existing Redis durable records are retained temporarily for rollback but are not dual-written.
- The PostgreSQL cutover starts with an intentionally empty dataset unless a separate import is explicitly approved.
- Date and time are represented by `dueAt`/`targetAt` instants plus an IANA workspace timezone; legacy date-only fields are removed at the cutover.
