# Ready and Waiting Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in the current session.

**Goal:** Make the existing Ready/Waiting workflow the default workspace experience.

**Architecture:** Compose the existing authorized dependency view into WorkspaceOverview in place of its date-grouped lists and progress summary. Keep quick-add, Board, task details, draft protection, navigation hashes, permissions, realtime reconciliation and prerequisite command recovery.

**Tech Stack:** Existing Next.js, React, Tailwind and UI components; no new dependencies or backend contracts.

## Decisions

The user delegated product decisions and asked to simplify everything. Reuse the working dependency view rather than build another prototype or rewrite the application. Keep the current visual system for this slice; defer further branding exploration, AI expansion and additional planning features. This slice does not close performance qualification or prove usability with real teams.

## Global constraints

- Preserve accessible names, essential labels, validation and recovery guidance.
- Use existing components, contracts and verification commands.
- Ready means no unfinished recorded prerequisites, not a guarantee that all real-world blockers are known.
- Keep secondary features in their existing navigation; do not delete capabilities or change authorization.

## Review focus

- Quick-add drafts survive dependency refreshes and read failures.
- Dependency read failures never produce a false empty or ready result.
- Workspace/account changes retain the existing graph isolation.
- Several prerequisites do not imply that finishing just one makes a dependent ready.
- Board navigation and canonical task opening remain available.

## Task 1: Integrate and clarify the existing handoff view

**Files:** `app/dashboard/page.tsx`, `components/workspace-overview.tsx`, `components/next-work-view.tsx` and their existing behavioral tests.

**Interfaces:** Add optional `workContent: React.ReactNode` to WorkspaceOverview; preserve its other props. Keep NextWorkView's existing graph and mutation contracts.

- [x] Update the dashboard journey to require the graph on entry and retain Board navigation; verify failure before integration.
- [x] Test that supplied work content replaces date lists/progress while quick-add remains mounted, including task-read errors.
- [x] Test prerequisite-owner visibility and links to unfinished dependent work in NextWorkView.
- [x] Compose NextWorkView through workContent and remove the duplicate readiness toggle/state.
- [x] Add prerequisite owners and needed-by links using the same authorized graph; preserve guarded task opening during unresolved commands.
- [x] Run focused tests, full `npm test`, lint, typecheck and review the diff.

## Evidence

The three new/updated behavioral checks failed before implementation; all 32 focused checks passed afterward. Full `npm test`: 532 total, 530 passed, two skipped, zero failures. `npm run type-check`, `npm run lint` and `git diff --check` passed. Independent static review found no blocking defects.

Existing tasks and graph reads are both retained because quick-add reconciliation and task opening still use the task hook. A task revision may trigger an additional graph read. This remains a performance qualification concern; no deployment, browser-layout or production-capacity claim is part of this change. The pre-existing untracked `design/` prototypes were left untouched.
