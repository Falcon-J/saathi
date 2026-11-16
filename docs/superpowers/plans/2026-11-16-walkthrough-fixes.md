# Walkthrough Fixes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve the walkthrough gaps and show verified working UI without deployment.

**Architecture:** Extend the existing review branch and components, retaining domain authorization and recovery. Add useful event metadata without schema changes; client-initiated OAuth remains the only reconnect path.

**Tech Stack:** Next.js, React, TypeScript, existing Tailwind/Radix components, Node tests, Playwright and disposable Supabase/Postgres/Redis.

**Spec:** docs/superpowers/specs/2026-11-16-walkthrough-fixes-design.md

## Global constraints
- No deployment or merge. Keep the exact branch Vercel guard.
- No new dependencies, invented OAuth URLs, automatic consent or permission expansion.
- Preserve version checks, drafts, recovery, exact scopes, accessible labels and destructive consequences.

## Review focus
- Legacy and deleted-task history must remain honest and scoped to the authorized workspace.
- Expired, revoked, disabled and provider-cleanup failure connection states must retain recovery.
- AI duplicate submission and uncertain draft confirmation must remain guarded.
- Small and dense canvases must fit at <=100%; manual zoom and responsive framing must work.
- Narrow management screens and dirty drafts must remain keyboard accessible.

### Task 1: History
Files: lib/data/tasks.ts, lib/data/activity.ts, components/activity-history.tsx and existing tests.
- [x] Add failing regression checks for task identity, preserved case, changed fields and legacy fallback.
- [x] Persist title/changed fields on successful mutations; join authorized current task for older events; render useful links and loaded-event filter.
- [ ] Run focused checks and database verification.

### Task 2: Connection recovery
Files: app/connections/page.tsx, components/mcp/disconnect-form.tsx, new setup component, agent-activity.tsx and tests.
- [x] Add failing recovery/disabled endpoint tests.
- [x] Provide setup and reconnect instructions using configured endpoint; require explicit retained-consent cleanup; group permissions and retain exact capability labels.
- [x] Preserve existing revocation actions; add empty-run connection navigation; run checks.

### Task 3: Ask Saathi and zoom
Files: canvas-shell.tsx, workspace-advisor.tsx, canvas-camera.tsx and tests.
- [x] Add failing tests for assistant heading/Send semantics and bounded automatic fit.
- [x] Fix panel state and Send label; bound fit using actual React Flow viewport geometry with maximum 1; preserve manual controls and recovery.
- [x] Run focused tests including camera, shell and advisor suites.

### Task 4: Remaining simplification
Files: canvas task panel/shell/command bar, member manager/invitation list, settings, guide and existing tests.
- [x] Resolve duplicate controls/location entries and empty commands; group terminal invites; simplify settings and update help.
- [x] Adapt existing acceptance assertions to actual intended controls; retain all domain journeys.

### Task 5: Review and evidence
- [ ] Run full type, lint, core, platform, database, e2e, production build, real OAuth/MCP, authenticated canvas and operations checks.
- [ ] Obtain independent review and resolve material findings.
- [ ] Capture and inspect desktop/mobile UI from passing real browser checks; confirm no Vercel deployment and unchanged production.

## Execution ledger
- Reused clean isolated codex/focused-blocker-canvas checkout at 1d581071; PR #29 already carries the no-deployment guard.
- Ruling: proceed with the concrete walkthrough recommendations and prior no-questions instruction; no second design approval needed for this authorized reversible work.
- Ruling: retain existing UI primitives rather than install another component library; follows repository reuse guidance and avoids styling regressions.

- Focused regression cycle: four initial UI failures were observed; subsequent combined suites passed (141 checks; reviewer independently verified 145). Type-check passed.
- Review: fixed Important archive-link routing with a RED → GREEN callback regression (10 history/archive checks pass). Extended immutable title snapshots to planned tasks and dependency events, adding SQL assertions. Corrected quick-add assignment instructions.
- First CI lint found an impure render-time clock check in invitation grouping. Removed it: invitation expiry is already authoritative in the server DTO.
- Real browser acceptance now captures history, assistant and overview framing. The disposable canvas runtime enables assistant presentation with no provider key and submits no AI request; existing advisor tests cover requests and uncertain draft confirmation.
- Ruling: retain optional pre-workspace planning and its data disclosure. It serves the no-workspace state; the workspace assistant remains the single workspace AI entry.

- Task editor: comments now stay mounted under a closed disclosure, keeping field edits focused and comment recovery/subscriptions intact. New disclosure regression was RED before implementation; planning-field tests target their own disclosure.
- First real Auth/browser/MCP/recovery run passed (43898860065), including the new history/assistant/framing captures. Full CI requires a fresh run after the lint and review fixes.
