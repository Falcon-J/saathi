# Canvas access integration

`policy.ts` is a pure, deny-by-default projection. `service.ts` is the persisted authorization adapter and exports the mutation APIs. Call the service from every domain read/write, passing the current SQL transaction when one exists. Existing owner/creator/assignee checks remain necessary: section capabilities narrow the domain's existing permissions rather than replacing them.

## First release sharing contract

- A user must already be a member of an attached workspace. An organization, section, group or application grant never inserts `workspace_members`.
- Sharing a section grants the selected capabilities to its inheriting subtree only where the person also satisfies existing workspace membership. Deeper `restricted` boundaries reset inherited grants.
- Use the existing Team invitation/join flow to establish workspace membership, explicitly add the accepted teammate to the company directory, then grant section access. The company panel links to the actual Team flow and lists accepted workspace teammates when adding company members.
- An unattached workspace retains current membership and owner/creator/assignee authorization. `WorkspaceAccess.attached === false` is the compatibility flag; the returned capability ceiling is not permission to skip existing domain checks.
- Additional canvas references are visual placement only. Only the one canonical parent path authorizes a resource. Parent identity is immutable in this release; movement requires a future explicit move command, never a visual drag write.
- `getAuthorizedCanvasView` returns resources and references from one bounded authorization snapshot. Both endpoints must remain readable, including existing workspace membership. Selected-workspace applications receive only references within their already-readable selected view. The company panel creates explicit links; the canvas displays them as dashed associations, separate from task prerequisites. Links grant no sharing or readiness changes.
- Root owners receive stored explicit grants. Root management does not bypass restricted children. Group membership changes also require management access to every active resource grant using that group, preventing indirect restricted-child access through group administration.

## Read APIs

Identifiers for users/workspaces/resources are UUIDs. OAuth application/client connections are managed by the existing platform delegation service.

`getWorkspaceAccess(actorId, workspaceId, db?)`, `assertWorkspaceAccess(actorId, workspaceId, capability, db?)` and `filterWorkspaces(actorId, rows, capability = "read", db?)` require current workspace membership and, when attached, current section policy. `listAuthorizedCanvasResources(actorOrUserId, db?)` returns only readable resource names. `getCanvasAccessDetails(actorId, resourceId)` requires management and serializes its metadata read against policy mutations. No denied response includes hidden resource or parent names.

The verified OAuth application grant remains the sole connection authority. The shared platform executor intersects that grant's current capabilities, workspace scope, expiry and revocation with these live human ACL checks. This module has no second agent principal, delegation table or token-binding mechanism. Selected-workspace applications can read only their authorized workspace summaries and already-readable canonical ancestors; global company management is rejected for those applications.

`createAccessResolver(graph, now)` compiles one immutable authorization snapshot for batched decisions. Never cache it across requests or commits. The loader uses one bounded recursive ancestor query, composite organization keys and strict validation. Invalid or over-limit data raises an unavailable result rather than reporting an empty company.

## Writes and recovery

Company/container creation, safe workspace attachment, company/group membership, grants, policy changes and references use strict input schemas and stable command IDs. Receipt hashes bind exact validated input. Lock order is command, organization, then affected workspaces in ID order. Existing workspace changes produce version increments, activity and durable outbox notifications in the same transaction; server actions schedule delivery after commit. Receipt recovery rechecks current authorization.

Attachment requires the current workspace owner, management of the canonical parent, the expected workspace version and explicit acknowledgement that existing members without section grants lose access. It stores an explicit owner grant. A new restricted section similarly stores an explicit creator grant. These are visible grants, not hidden administrator exceptions.

The company panel stores the exact command before dispatch and retains uncertain outcomes for same-command retry after remount. Definitive input, conflict and constraint rejections do not masquerade as committed changes. Browser roles have no direct table access; every access table has RLS enabled and privileges revoked from `anon` and `authenticated`.

`0013_canvas_access.sql` must be installed before wiring production guards. This partition does not apply it or change hosted state. Focused database acceptance requires a loopback `DATABASE_TEST_URL` and an already migrated disposable database.
