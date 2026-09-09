# Existing-Capability Interface Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Saathi design to existing product capabilities without adding mockup-only behavior.

**Architecture:** Keep the current Next.js modular-monolith and its data/authorization boundaries. Consolidate visual decisions in existing token and component surfaces, then adapt each current screen through its existing component contract.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, existing Radix/shadcn primitives, Supabase Auth, PostgreSQL, Redis-backed SSE.

**Spec:** `docs/superpowers/specs/2026-09-09-existing-capability-interface-refresh-design.md`

## Global Constraints

- Do not add schema fields, routes, dependencies, roles, metrics, or AI mutations to imitate the reference images.
- Preserve the logo, server actions, authorization, invitation identity checks, optimistic task behavior, and realtime reconciliation.
- Use test-first cycles for behavior changes and behavioral contract tests for rendered screen requirements.
- Do not stage, commit, push, deploy, or modify a remote environment without separate authorization.

---

### Task 1: Shared visual foundation and shell contract

**Files:**
- Modify: `app/globals.css`
- Modify: `styles/theme.css`
- Modify: `components/dashboard-navigation.tsx`
- Test: `app/dashboard/design-tokens.test.cjs`
- Test: `components/dashboard-navigation.test.ts`

**Interfaces:**
- Consumes: existing CSS custom properties and `DashboardNavigation` callbacks.
- Produces: the light Saathi token system and navigation containing only current destinations.

- [ ] Add failing behavioral tests for the violet-accent light tokens and supported navigation labels.
- [ ] Run the focused tests and confirm they fail for the missing refreshed contract.
- [ ] Implement the minimum token and navigation changes without adding routes.
- [ ] Run focused tests and confirm they pass.

### Task 2: Authentication and recovery suite

**Files:**
- Modify: `components/auth-form.tsx`
- Modify: `components/password-recovery-form.tsx`
- Test: `components/auth-form.test.cjs`
- Create: `components/password-recovery-form.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `signIn`, `signUp`, `requestPasswordReset`, and `updatePassword` contracts.
- Produces: responsive branded forms with inline recoverable feedback and no unconfigured OAuth control.

- [ ] Add failing tests for auth/recovery hierarchy and supported controls.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Restyle the existing components without altering auth behavior.
- [ ] Run focused tests and confirm they pass.

### Task 3: Dashboard, workspace, and board composition

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/workspace-overview.tsx`
- Modify: `components/task-list.tsx`
- Test: `app/dashboard/dashboard-recovery.test.cjs`
- Test: `lib/overview-capabilities.test.ts`

**Interfaces:**
- Consumes: `useWorkspaces`, current workspace views, `TaskList` callbacks, and existing recovery states.
- Produces: refreshed overview and board composition with only supported actions.

- [ ] Add failing contract assertions for the refreshed hierarchy and absence of unsupported primary actions.
- [ ] Verify the focused tests fail for the intended missing presentation.
- [ ] Adapt the current composition and styling without changing data flow.
- [ ] Run focused dashboard/task contract tests.

### Task 4: Workspace creation, members, invitations, and settings

**Files:**
- Modify: `components/workspace-create-form.tsx`
- Modify: `components/member-manager.tsx`
- Modify: `components/workspace-settings.tsx`
- Modify: `components/invitation-response.tsx`
- Test: `components/member-manager.test.cjs`
- Add focused source-contract tests beside the owning components where needed.

**Interfaces:**
- Consumes: existing manual/reviewed-plan creation, invitation, membership, and workspace-update actions.
- Produces: refreshed forms and tables limited to owner/member and supported workspace fields.

- [ ] Write failing tests for current-capability-only controls and local mutation feedback.
- [ ] Verify the failures identify missing UI contracts.
- [ ] Implement the minimum presentation changes while preserving server-action calls.
- [ ] Run the focused tests.

### Task 5: Guide and recovery surfaces

**Files:**
- Modify: `app/guide/page.tsx`
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/loading.tsx`
- Modify: `app/dashboard/loading.tsx`
- Test: `lib/product-guide.test.ts`
- Test: `app/dashboard/dashboard-recovery.test.cjs`

**Interfaces:**
- Consumes: existing guide content and session/dashboard boundary states.
- Produces: branded guide, loading, temporary failure, and sign-in recovery paths.

- [ ] Add failing tests that distinguish product guidance, temporary failure, and sign-in recovery.
- [ ] Run focused tests and confirm intended failures.
- [ ] Implement the shared presentation without collapsing distinct failure meanings.
- [ ] Run focused tests.

### Task 6: Verification and review

**Files:**
- Modify only files exposed by verification defects.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: fresh validation evidence and a reviewed, narrow diff.

- [ ] Run `npm test`.
- [ ] Run `npm run type-check -- --incremental false`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect `git status --short` plus the full diff.
- [ ] Start the application and verify the public/authenticated routes at desktop and 390x844 viewports when local auth services are available.
- [ ] Record checks that could not run and their exact blockers; do not claim production readiness.

## Plan self-review

- Every approved existing-capability surface maps to a task.
- Unsupported features remain explicit non-goals rather than placeholders.
- No task changes schema, authorization, realtime, or provider contracts.
- Each behavior change starts with a focused failing test.
- Commit steps are intentionally omitted because the user has not authorized committing this new slice.
