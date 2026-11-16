# Focused Blocker Canvas Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved selected-task/blocker graph and compact inspector, then show the working local app without deploying.

**Architecture:** Restrict the pure task-neighborhood projection to unfinished direct prerequisites. Reuse React Flow and its camera with transparent structural grouping; simplify CanvasTaskPanel and retain existing domain editors.

**Tech Stack:** Next.js 16, React 19, TypeScript, React Flow, existing Tailwind/Radix components, Node tests, Playwright, local Supabase/Postgres/Redis.

**Spec:** docs/superpowers/specs/2026-11-16-focused-blocker-canvas-design.md

## Global constraints

- No deployment or hosted preview before review. The review branch explicitly disables Vercel deployments so GitHub CI can verify the real app without publishing it.
- Use complete authorized graph records; preserve all editor/permission/recovery contracts.
- Reuse existing components and checks; no new dependencies or production fixtures.

## Review focus

- Completion/reopening changes visible blockers and readiness from authoritative state.
- Missing selection and more than 39 direct blockers remain bounded and honest.
- Long names and narrow viewports preserve essential actions and readable labels.
- Read-only members cannot gain editing/completion through simplified controls.
- Workspace hierarchy/search and camera navigation still work outside task focus.

### Task 1: Focused graph and inspector

Files: features/canvas/task-neighborhood.ts and tests; features/canvas/model.ts and tests; components/canvas/canvas-flow.tsx and tests; canvas-task-panel.tsx and tests; canvas-shell.tsx and tests.

Interfaces: taskNeighborhood consumes tasks with optional completed/status fields and returns selected plus direct unfinished blockers, level -1/0 and blocker-only overflow count. projectCanvas preserves complete records. CanvasTaskPanel keeps its existing callbacks/permission props.

- [x] Write regression tests for direct-only unfinished blockers, completion/reopening, bounded overflow, transparent focused groups and compact inspector.
- [x] Run focused Node tests; expect intentional failures on existing behavior.
- [x] Implement minimal projection and presentation changes; remove Related work toggle and focused tool picker.
- [x] Run focused tests; expect all passing.

### Task 2: Full verification and working UI

Files: scripts/verify-ready-waiting.mjs; CONTEXT.md if behavior description needs adjustment.

- [ ] Update browser assertions to the approved inspector and graph, retaining real local Auth/database tests.
- [ ] Run type-check, lint, npm test, test:platform, database suites, e2e, build, verify:canvas:local, verify:mcp:local and verify:operations:local against disposable local services. Inspect every result and fix failures.
- [ ] Capture working local desktop/mobile UI and verify blocker selection/completion, editing, keyboard and accessibility.
- [ ] Obtain independent code review, address material findings, and keep deployment pending.

## Execution record

- Existing isolated release worktree reused; clean at start. Branch: codex/focused-blocker-canvas. Local Docker and disposable Supabase are healthy.
- Task 1: 102 focused checks passed after expected RED failures. Added a camera namespace migration regression: RED then GREEN, preventing saved wide-graph cameras from restoring into focused blocker layout.
- Core suite and type-check passed. Remaining checks resumed sequentially after available RAM fell below 300 MB.
- Ruling: existing local Auth containers belong to the original checkout; preserve them with Supabase's default backup and start a checkout-owned saathi-performance-ci fixture, keeping the verifier's ownership guard intact. Cost: temporary interruption of the old disposable local Auth endpoints; saved data is preserved.
- Independent review: no Critical or Important findings. Final: minor (deferred): the explicit structural pointer-events style is overwritten by geometry; installed React Flow already supplies pointer-events:none for the nonselectable/nondraggable structural node, so input behavior remains correct.
- Ruling: use GitHub Linux CI after local Docker transfers and restart stalled. vercel.json disables deployment for this exact review branch before its first push; unspecified branches retain their normal behavior. Cost: the review branch has no Vercel preview until explicitly enabled after review.
- Operations drill: initial backup/restore failed under local infrastructure load; retry with a longer local Docker subprocess allowance passed restored-data comparison, Redis outage recovery and exact fixture cleanup. A separate minimal dump/restore also passed; no restore flags or business assertions changed.
- Database fixture fix: the uncommitted writer's shared 10-second deadline expired while three reads were running, rolling back attachment and cascading into a later policy assertion. Separate bounded read/hold deadlines preserve all authorization assertions; the explicit short-deadline regression was RED then GREEN.
- Additional UI regressions: keyboard focus now targets All tasks instead of a hidden picker; manual Fit View excludes the invisible structural workspace. Both new checks were RED then GREEN. Inspector layout follows the approved preview with a narrower panel and All tasks above the title.
