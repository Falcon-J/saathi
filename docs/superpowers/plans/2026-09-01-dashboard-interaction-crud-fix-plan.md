# Saathi dashboard interaction and CRUD fix plan

> **Status:** approved for implementation; do not commit or push without a separate user instruction.

## Goal

Make the authenticated Saathi dashboard predictable and usable: navigation must visibly work, feedback must match the light Saathi system and appear once, task editing must cover all supported fields, and workspace/team flows must show truthful state while preserving the existing Next.js, Redis, Server Actions, and SSE contracts.

## Boundaries

- Keep `/dashboard` as the canonical signed-in experience.
- Do not add a UI framework, global state library, task detail route, or Redis/SSE rewrite.
- Preserve server-side workspace policy as the authority for authorization.
- Keep optimistic UI, but only confirm success after the authoritative action succeeds.
- Preserve unrelated untracked files and do not stage, commit, push, or deploy without explicit authorization.

## Acceptance evidence

- Sidebar destinations visibly scroll to the corresponding dashboard sections, show an active item, work by keyboard, and have a compact mobile equivalent.
- One themed toast is emitted per completed user action; errors are actionable and never accompanied by a success toast.
- A user can edit title, description, priority, due date, status, and assignee from one task edit surface.
- Failed mutations roll back or refresh authoritative data; conflicts preserve the draft and tell the user how to recover.
- Workspace rename is implemented once, member identity uses the correct contract, invitation language is truthful, and offline/Redis states have a retry path.
- Focused tests, type-check/lint/build, and authenticated browser checks on desktop/mobile provide evidence for the changed flows.

## Phase 0: Baseline and seams

**Files to inspect/update**

- `app/dashboard/page.tsx`
- `components/task-list.tsx`
- `hooks/use-workspaces.ts`
- `hooks/use-notifications.ts`
- `components/ui/toast.tsx`, `components/ui/toaster.tsx`, `app/layout.tsx`, `app/globals.css`
- `app/tasks/contract.ts`, `app/tasks/actions.ts`
- `components/member-manager.tsx`, `components/workspace-switcher.tsx`, `components/workspace-name-inline-editor.tsx`, `app/actions/workspaces.ts`

**Work**

1. Capture the baseline test/type/build state and current dashboard behavior with a valid local backend when available.
2. Add focused regression tests first for toast variant/result handling, navigation targets, and task update normalization.
3. Use existing client and server contracts rather than creating duplicate task or permission types.

## Phase 1: Shared interaction system

**Files**

- `app/globals.css`
- `components/ui/toast.tsx`
- `components/ui/toaster.tsx`
- `app/layout.tsx`
- `hooks/use-notifications.ts`
- `app/dashboard/page.tsx`
- new small dashboard navigation component/hook only if the existing page cannot own scrolling cleanly

**Work**

1. Make toast tokens semantic and available at the application root: neutral, success, information, warning, and danger. Keep the dashboard light palette rather than inheriting dark root variables.
2. Route short-lived action feedback through one `useToast` result path. Remove Sonner call sites and prevent notification-center writes from duplicating action toasts.
3. Make each action wrapper inspect the returned `{ error }` result before showing success. Normalize thrown and returned failures into one error presentation.
4. Replace passive hash-only sidebar anchors with accessible scrolling navigation, sticky-header offsets, active-section tracking, and a compact mobile control. Retain the existing dashboard section IDs as the stable contract.

**Tests**

- Toast variant/result tests prove one success on success, no success on `{ error }`, and themed class/token coverage.
- Navigation unit or DOM test proves each control targets an existing labelled region and keyboard activation works.

## Phase 2: Complete task CRUD

**Files**

- `components/task-list.tsx`
- `app/dashboard/page.tsx`
- `hooks/use-workspaces.ts`
- `app/tasks/contract.ts`
- `app/tasks/actions.ts`
- `hooks/usePermissions.ts`
- focused task tests beside the existing contract tests

**Work**

1. Replace UI `Partial<Task>` updates with the existing validated `TaskUpdate` contract (or a narrowly derived client input type) and require explicit mutation callbacks.
2. Implement one accessible edit dialog or panel with title, description, priority, due date, status, and assignee. Validate client-side for immediate feedback while leaving server validation authoritative.
3. Keep quick status/assignment controls only where they use the same update path as the full editor.
4. In `useWorkspaces`, apply optimistic updates consistently (including `completed`/status), disable only the active mutation control, reconcile SSE events, and on failure either roll back or refresh the authoritative workspace state.
5. Preserve an edit draft on conflict, present a clear refresh/retry choice, and use normalized e-mail comparison only as client display convenience; server policy remains the authorization authority.

**Tests**

- Valid and invalid `TaskUpdate` payloads, including normalised assignee e-mail and date fields.
- Success, returned-error, thrown-error, conflict, and rollback paths for edit/assign/status/delete.
- UI test for the full edit surface and control disabling while the mutation is in flight.

## Phase 3: Workspace, membership, and invitation truth

**Files**

- `components/workspace-switcher.tsx`
- `components/workspace-name-inline-editor.tsx`
- `components/workspace-name-editor.tsx` (remove or retire only if unused)
- `components/member-manager.tsx`
- `app/actions/workspaces.ts`
- `app/actions/invitations.ts`
- `hooks/use-workspaces.ts`

**Work**

1. Keep one workspace rename surface in the page header and remove duplicate rename ownership from the switcher.
2. Align `memberId`/`memberEmail` names and values from UI through Server Actions; prevent duplicate active invitations before optimistic confirmation.
3. Change invite copy to describe an in-app invitation unless verified email delivery exists.
4. Show owner/member status from authoritative workspace data and make partial Redis failures visible rather than claiming completion. Publish semantically correct workspace events where the existing realtime contract supports them.
5. Add clear empty workspace and empty board calls to action without changing the core board-first layout.

**Tests**

- Member removal uses the server’s expected identity.
- Duplicate invitation and failed invite leave the UI truthful.
- Rename event/result semantics and workspace-empty rendering.

## Phase 4: Recovery, accessibility, and responsive states

**Files**

- `app/dashboard/page.tsx`
- `hooks/use-workspaces.ts`
- realtime connection/status components already used by the dashboard
- `app/page.tsx` and session boundary only if inspection confirms stale cookies can cause an unhandled Redis render failure

**Work**

1. Add skeleton, empty, offline, Redis-unavailable, reconnecting, and retry states at the actual data/realtime boundaries.
2. Ensure the app fails closed on unavailable session storage rather than rendering a public-route 500 for a stale session cookie, without treating unavailable Redis as valid authentication.
3. Ensure keyboard focus, dialog semantics, visible focus rings, reduced-motion respect, and mobile layout all retain access to workspace, board, team, and realtime actions.

**Tests**

- Error/retry state tests for workspace fetch and mutation failures.
- Browser checks for keyboard navigation, narrow viewport board layout, offline/reconnect state, and no overlapping panels.

## Phase 5: Validation and hand-off

Run in this order after each affected slice and again on the final combined diff:

1. Relevant focused tests.
2. `npm test`.
3. `npm run lint` and `npm run type-check` if present.
4. `npm run build`.
5. `git diff --check` and final diff review.
6. Browser checks: sign-in success/failure, workspace creation/rename, member invitation/removal, task create/edit/assign/status/delete, duplicate-toast absence, sidebar desktop/mobile, two browser tabs with SSE, and a Redis outage/recovery path.

External deployment checks remain a release gate: production environment variables and Redis reachability must be verified in the hosting logs without exposing credentials.
