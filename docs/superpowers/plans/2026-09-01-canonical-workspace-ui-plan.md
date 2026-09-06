# Canonical Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/dashboard` the single, board-first workspace experience so a team can open Saathi, understand what needs attention, and move a task forward without navigating between competing task UIs.

**Architecture:** Keep the current modular-monolith boundary. `app/dashboard/page.tsx` owns authenticated workspace composition, `hooks/use-workspaces.ts` owns client workspace/task state and realtime reconciliation, and `components/task-list.tsx` owns the board/task interaction surface. The legacy `/tasks` route becomes a compatibility entry point that redirects to the canonical dashboard rather than maintaining a second task implementation.

**Tech Stack:** Existing Next.js App Router, React, TypeScript, Tailwind/CSS classes already used by the repository, existing workspace/task actions, and the current SSE/Redis realtime client. Do not add a UI framework or state library for this slice.

**Spec:** `docs/superpowers/specs/2026-09-01-saathi-product-design-design.md`

## Global Constraints

- Preserve unrelated working-tree changes, especially the existing uncommitted board changes in `components/task-list.tsx` and the untracked `.kiro/` directory.
- Do not overwrite the current `TaskList` board work. Review it in place and make only the smallest changes required to meet the acceptance criteria below.
- Treat `/dashboard` as the canonical authenticated workspace route. Do not add another task-page abstraction.
- Keep existing server actions, task payloads, membership checks, and realtime event contracts unless a focused compatibility defect is found.
- Do not implement AI, Jira/GitHub import, custom fields, epics, sprints, workflow builders, mobile-native UI, or microservices in this slice.
- Do not claim realtime performance, security readiness, or production scale from visual changes alone.
- Preserve keyboard access, visible focus states, loading states, empty states, error states, and destructive-action confirmation behavior.

## Acceptance Criteria

- An authenticated user lands on `/dashboard` and sees one obvious primary workspace board.
- A user can add a task, assign it, move it between open and completed states, and edit/delete it through the existing callbacks.
- The board remains usable when there are no tasks, while tasks are loading, and when a task action fails.
- Realtime task changes continue to reconcile through the existing `useWorkspaces` flow without duplicate rendering or losing the local task draft.
- `/tasks` no longer presents a competing legacy task UI; it redirects to `/dashboard` while preserving the route as a compatibility entry point.
- Shared visual choices are expressed through the existing global styling surface rather than one-off values copied across components.
- The final diff contains no changes to `.kiro/` or unrelated user work.

---

## Task 1: Establish the canonical route boundary

**Files:**

- `app/tasks/page.tsx`
- `app/dashboard/page.tsx`
- Relevant route smoke test if one exists under `src/test/` or `app/`

**Steps:**

- [ ] Inspect callers, navigation links, onboarding actions, and tests that currently target `/tasks`; record any contract that must remain compatible.
- [ ] Replace the legacy `/tasks` page rendering path with a server-side redirect to `/dashboard`, keeping the change limited to route ownership rather than deleting the old components in this slice.
- [ ] Confirm dashboard authentication behavior remains the owner of authenticated workspace access; do not duplicate session or membership logic in the redirect.
- [ ] Update only stale internal links or test expectations that still identify `/tasks` as the primary workspace.
- [ ] Verify the route boundary with the repository’s focused route test or, if no route test exists, the development server smoke flow for `/tasks` and `/dashboard`.

**Done when:** `/dashboard` is the only task experience reached through normal navigation, and `/tasks` is a safe compatibility redirect with no duplicated data fetching or UI ownership.

## Task 2: Make the dashboard board the first-use execution surface

**Files:**

- `app/dashboard/page.tsx`
- `components/task-list.tsx`
- `hooks/use-workspaces.ts` only if a proven rendering/reconciliation mismatch is found

**Steps:**

- [ ] Preserve the existing `TaskList` working-tree changes and review the resulting Open/Completed board against the current `TaskList` props and `Task` type rather than recreating the component.
- [ ] Keep the primary action visually obvious: add-task entry, task title, status, owner, priority, and due date must remain discoverable without opening a secondary route.
- [ ] Give the board explicit loading, empty, action-error, and no-members states using the existing state and callback contracts; do not invent a new global state store.
- [ ] Ensure the dashboard keeps the workspace switcher and team context visible without allowing secondary panels to overpower the board.
- [ ] Ensure task actions continue to use the existing callbacks (`onAddTask`, `onToggleTask`, `onDeleteTask`, `onAssignTask`, and optional `onEditTask`) so optimistic updates and SSE reconciliation remain centralized in `useWorkspaces`.
- [ ] Add or update the smallest focused component test only if the repository already has a compatible React test setup; otherwise use type checking plus browser smoke and document the missing test harness.

**Done when:** a new or returning user can understand what to do next from `/dashboard` and complete the core task loop without visiting `/tasks`.

## Task 3: Normalize the visual foundation without adding a design dependency

**Files:**

- `app/globals.css`
- `app/dashboard/page.tsx`
- `components/task-list.tsx`
- Any directly rendered dashboard child that uses conflicting legacy classes

**Steps:**

- [ ] Identify the minimum repeated tokens needed for the approved language: charcoal surfaces, readable light text, mint for primary/progress/success, amber for attention, red for destructive/error, consistent border radius, and the existing spacing rhythm.
- [ ] Define or consolidate those values in the existing global styling mechanism; do not add a token package, component library, or theme engine for one screen.
- [ ] Apply the tokens to the dashboard board, task states, focus rings, buttons, and panels while preserving semantic contrast and responsive behavior.
- [ ] Remove only conflicting one-off styling that is on the canonical dashboard path; leave unrelated legacy components untouched because `/tasks` is being retired through redirect rather than broad deletion.
- [ ] Check the small-screen layout and keyboard focus order manually in a browser at a narrow viewport.

**Done when:** the canonical workspace reads as one calm, coherent interface and the visual system has one obvious source for the shared values used by this slice.

## Task 4: Verify the slice and inspect the final diff

**Files:**

- No additional source files unless verification exposes a defect.

**Steps:**

- [ ] Run focused type validation:

  ```text
  npm run type-check -- --incremental false --pretty false
  ```

- [ ] Run the existing realtime contract tests to ensure the UI slice did not break the event consumer:

  ```text
  npm run test:realtime
  ```

- [ ] Run the production build:

  ```text
  npm run build
  ```

- [ ] Start the app with the repository’s development command and manually verify `/`, `/login`, `/dashboard`, and `/tasks`; confirm unauthenticated routing and the `/tasks` compatibility redirect.
- [ ] With an authenticated local session if available, verify add, assign, complete, edit, delete, empty, loading, and error states from the dashboard.
- [ ] Run `git diff --check`.
- [ ] Review `git status --short` and the final diff. Confirm `.kiro/` and the pre-existing `components/task-list.tsx` work are preserved intentionally, and stage nothing unless the user separately authorizes a commit.

**Done when:** the slice has focused validation evidence, remaining environment-only checks are called out honestly, and the diff is narrow enough to review and roll back as one change.

---

## Plan self-review

- Product thesis covered: board-first execution, fast setup, calm density, and realtime as an existing capability.
- Scope controlled: one canonical route and one UI foundation slice; migration and security hardening remain separate follow-up work.
- Ownership preserved: dashboard composes, `TaskList` renders/interacts, `useWorkspaces` owns client state/reconciliation, existing actions remain mutation authority.
- Compatibility addressed: `/tasks` remains a redirect entry point rather than an abrupt removal.
- Verification is observable: type check, realtime contract tests, build, route smoke, manual core loop, and diff inspection.
- Rollback is simple: revert the focused route/UI commit; no schema, event-contract, dependency, or deployment change is required.
