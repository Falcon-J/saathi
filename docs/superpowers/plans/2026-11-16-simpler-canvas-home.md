# Simpler Canvas Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the approved Canvas home with one task surface, one AI entry and useful task dependency context.
**Architecture:** Reuse CanvasShell, React Flow, WorkspaceBoard/TaskList and NextWorkView. Add a small read-only task-panel component and a pure bounded graph-neighborhood projection. Existing authoritative actions continue to own every mutation.
**Tech Stack:** Existing Next.js, React, TypeScript, React Flow, accessible UI components.
**Spec:** ../specs/2026-11-16-simpler-canvas-home-design.md

## Global Constraints

No new dependencies or schema changes. Preserve domain permissions, editor drafts, receipt recovery, history, mobile access and explicit AI confirmation. Existing dashboard URLs remain compatible. Visible focused task nodes are bounded to 40; selected work is never omitted.

## Review Focus

- A selected task outside the first 40 records must remain visible and editable.
- A revoked/missing task cannot return through remembered focus or a stale panel.
- Hidden editor/quick-add drafts must survive AI, task selection and workspace boundaries.
- Old task editor links must still open the editor; new inspection links must reload into inspection.
- Mobile map/panel resizing must keep camera and controls accessible without horizontal overflow.

### Task 1: Home routing and task projection
**Files:** app/page.tsx, components/auth-form.tsx, lib/supabase/{auth-boundary,config}.ts; features/canvas/{model,navigation-url}.ts; new features/canvas/task-neighborhood.ts and tests.
**Interfaces:** `taskNeighborhood(tasks, dependencies, selectedId, relatedOnly, limit=40)` returns visible IDs, ordered levels and overflow. `projectCanvas` consumes optional relatedOnly and produces compact relationship nodes. `work` is an accepted CanvasTool.
- [x] Add regressions for safe Canvas defaults, legacy editor URLs, cycle-safe neighborhood traversal, stable bounded selection and visible dependency edges in dense graphs; run red.
- [x] Implement presentation-only graph projection and home defaults; run focused suites green.

### Task 2: One reusable task panel
**Files:** new components/canvas/canvas-task-panel.tsx/tests; components/{workspace-board,task-list,next-work-view}.tsx and hooks/use-task-board.ts/tests.
**Interfaces:** CanvasTaskPanel takes authorized workspace/graph, readiness, selection, filter and inspect/edit/create callbacks. WorkspaceBoard/TaskList accept editorOnly plus an authorized task snapshot; board loading can be disabled. NextWorkView accepts inspectorOnly and an initial task, preserving pending-command recovery.
- [x] Add regressions for all readiness states, bounded rendering/search, blocker/dependent links, read-only controls and suppressed duplicate board reads; run red.
- [x] Implement the unified list/summary and reuse existing editing/creation/receipt flows; run green.

### Task 3: Canvas shell and relationship camera
**Files:** components/canvas/{canvas-shell,canvas-flow,canvas-camera,canvas-command-bar}.tsx and tests; navigation links outside legacy Dashboard.
**Interfaces:** New node inspection uses `view=work`; explicit edits retain `view=tasks`. Header command placement consumes existing search/actions; Ask Saathi is a single header control. Related-work mode feeds the pure projection and camera neighborhood bounds.
- [x] Add shell regressions for inspection versus editing, group filters sharing one panel, AI entry uniqueness, retained drafts and mobile map/panel layout; run red.
- [x] Consolidate visible controls and panel layout, preserve legacy URL/tool dispatch, show bounded relationship nodes and adapt camera fit; run green.

### Task 4: Verification and review
**Files:** existing browser acceptance helpers and evidence/ledger.
- [ ] Adapt browser journeys to explicit graph inspection then Edit, while retaining legacy dashboard coverage.
- [ ] Run npm test, npm run test:platform, type-check, lint and production build; fix failures.
- [ ] Verify authenticated desktop/mobile tasks, dependencies, AI/recovery/history/access flows using disposable fixtures; inspect screenshots.
- [ ] Request a fresh whole-branch code review, fix important findings, and record exact results before completion.

## Ledger

Ruling: Use native execution in the existing clean release worktree — the user approved the preview and previously asked to proceed without further confirmation. Preserve legacy Dashboard for existing links/tests, remove its primary entry points; no capability deletion.

2026-11-16 implementation ledger: routing/projection regressions went red then green (28 projection tests, 30 routing/UI tests). Shared panel/editor checks and independent review fixes passed 85 tests; encoded sign-out and auth fallback passed 41 tests. Full core run: 682 passed, two optional skips, one stale auth-fallback expectation; its corrected suite passed. Independent review identified deletion reachability, encoded logout namespace and orphaned prerequisite close; all three fixed. Browser preparation exposed a CRLF/LF mismatch in disposable Auth pool configuration; six regression tests now pass after canonical LF normalization. Full build/browser/platform verification remains pending.
