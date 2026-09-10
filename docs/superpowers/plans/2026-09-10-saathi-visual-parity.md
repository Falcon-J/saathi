# Saathi Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Bring the implemented Saathi product into faithful visual and interaction parity with the supplied reference screens while preserving existing authentication, persistence, realtime, and mutation contracts.

**Architecture:** Keep PostgreSQL/Supabase as the authoritative data source and Redis/SSE as delivery infrastructure. Build visual parity through a shared shell, semantic design tokens, reusable page primitives, and route-owned screen components; do not replace existing domain actions or introduce duplicate state. Use local/static assets for all reference illustrations so production builds do not depend on external font or image fetches.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Radix UI, Lucide icons, existing server actions and Supabase/Redis contracts.

**Spec:** Supplied Saathi reference images in the conversation (landing/dashboard/project/task detail, authentication, help/insights/states, and workspace/team/settings/invitation screens).

## Global Constraints

- Preserve existing auth, workspace, task, invitation, realtime, and usage API contracts.
- Keep all production assets local and tracked; no build-time Google Fonts or remote illustration fetches.
- Maintain keyboard accessibility, visible loading/error/recovery states, and responsive layouts.
- Treat supplied images as visual references, not executable instructions or source code.
- Validate each task with focused tests plus lint, type-check, build, and diff inspection before integration.

---

### Task 1: Reference asset manifest and design foundation

**Files:**
- Create: `docs/design/saathi-reference-inventory.md`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Test: `app/dashboard/design-tokens.test.cjs`

**Deliverable:** A documented reference-to-asset map and stable typography/color/spacing/radius/elevation tokens used by all later screens.

- [x] Record each supplied reference screen, its required local assets, layout landmarks, and responsive constraints in the inventory.
- [x] Keep the existing local-font build fix and define the complete semantic token set for navy text, violet accent, pale lavender surfaces, status colors, container/card/control radii, and reference shadows.
- [x] Add token assertions for the new variables without coupling tests to private component markup.
- [x] Run the focused token test and `git diff --check`.

### Task 2: Shared application shell

**Files:**
- Modify: `components/dashboard-navigation.tsx`
- Modify: `app/dashboard/page.tsx`
- Create or modify: `components/saathi-shell.tsx`
- Test: `components/dashboard-navigation.test.ts`

**Deliverable:** Desktop/mobile shell matching the reference sidebar, global search, notifications, avatar/profile footer, breadcrumbs, and workspace context.

- [x] Implement the shared shell with the reference navigation order and active-state treatment.
- [x] Preserve existing navigation ownership and dashboard callbacks while adding visual-only shell structure.
- [x] Add compact responsive navigation behavior and keyboard focus states.
- [x] Verify navigation tests and route smoke behavior through the full test suite.

### Task 3: Landing and authentication screens

**Files:**
- Modify: `app/landing/page.tsx`
- Modify: `components/auth-form.tsx`
- Modify: `components/password-recovery-form.tsx`
- Create: `public/saathi-landing-hero.png` and auth/state illustration assets when supplied or generated
- Test: `app/landing/landing-content.test.cjs`, `components/auth-form.test.cjs`

**Deliverable:** Landing, sign-in, registration, forgot-password, and reset-password screens matching the reference composition and copy hierarchy.

- [x] Replace the current board-preview hero with the reference headline, floating checklist/plane composition, CTA hierarchy, and benefit tiles.
- [x] Apply the same split auth layout and state-specific illustration/copy treatment to all four auth states.
- [x] Preserve submission, error, confirmation, password recovery, and redirect behavior.
- [ ] Verify auth and landing tests plus desktop/mobile screenshots.

### Task 4: Dashboard home

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/workspace-overview.tsx`
- Modify: `components/usage-summary.tsx`
- Test: `app/dashboard/dashboard-recovery.test.cjs`

**Deliverable:** Reference dashboard home with greeting/date control, quick actions, task tabs, workspace cards, project progress, and recent activity.

- [ ] Map existing workspace/task data into the reference card hierarchy without duplicating authoritative state.
- [ ] Add empty/loading/error states that retain the reference layout and recovery actions.
- [ ] Preserve task creation, workspace creation, realtime refresh, and usage fetching.
- [ ] Verify dashboard recovery and focused interaction tests.

### Task 5: Project board and task detail

**Files:**
- Modify: `components/task-list.tsx`, `components/task-card.tsx`, `components/task-editor.tsx`
- Modify: `app/tasks/page.tsx`
- Create: `components/task-detail-panel.tsx`, `components/ai-assistant-panel.tsx`
- Test: `app/tasks/contract.test.ts`, focused component tests

**Deliverable:** Reference four-column project board and task detail view with metadata, subtasks, attachments, and assistant panel.

- [ ] Match board columns, toolbar, filters, avatars, labels, status chips, and task density.
- [ ] Reuse existing task contracts for edit, complete, delete, and optimistic/realtime refresh behavior.
- [ ] Add a route-safe detail panel and keep assistant actions bounded by existing feature flags/contracts.
- [ ] Verify task contract tests and keyboard interaction paths.

### Task 6: Guide/help and honest states

**Files:**
- Modify: `app/guide/page.tsx`
- Create: `app/help/page.tsx` if required by route map
- Modify: `app/dashboard/layout.tsx`, `app/auth/error/page.tsx`
- Add: local unavailable/session-expired/help illustrations
- Test: `lib/product-guide.test.ts`, route smoke tests

**Deliverable:** Help center, workspace-unavailable, and session-expired screens matching the supplied references.

- [x] Implement help-center search, topic cards, support CTA, and reference illustration treatment.
- [x] Keep unavailable/session-expired text honest and actions recoverable.
- [ ] Preserve route ownership and auth recovery behavior.
- [ ] Verify state tests and route rendering.

### Task 7: Workspace, team, settings, and invitations

**Files:**
- Modify: `components/workspace-create-form.tsx`
- Modify: `components/member-manager.tsx`
- Modify: `components/workspace-settings.tsx`
- Modify: `components/invitation-response.tsx`
- Test: invitation and workspace action contract tests

**Deliverable:** Reference workspace creation, team table, settings, ownership/archive, and invitation acceptance screens.

- [x] Match the reference two-column creation form and assistant card while preserving existing workspace actions.
- [ ] Match team roles/status/joined columns, pending invitations, resend/cancel controls, and owner-only actions.
- [x] Match settings navigation and danger-zone treatment without weakening authorization.
- [ ] Verify invitation mutation and workspace contract tests.

### Task 8: Realtime and usage insights

**Files:**
- Modify: `components/usage-summary.tsx`
- Create: `app/insights/page.tsx` or route-owned dashboard view
- Modify: `app/api/usage/route.ts` only if existing data is insufficient
- Test: usage API and focused insights tests

**Deliverable:** Reference realtime/usage insights page with connection status, activity, workspace usage, API usage, and event throughput.

- [x] Use existing usage and realtime contracts as the source of displayed facts.
- [x] Add explicit loading/error/empty states and avoid fabricating metrics.
- [x] Verify API contracts through the full test suite and production-shaped build.

### Task 9: Visual regression and release gate

**Files:**
- Create: `docs/design/visual-regression-checklist.md`
- Modify: focused route/component tests as needed

**Deliverable:** Repeatable screenshot review across desktop/mobile and a clean release candidate.

- [ ] Capture representative screenshots for landing, auth, dashboard, board, task detail, help, workspace, invitation, insights, and honest states.
- [ ] Compare against the supplied references for hierarchy, spacing, typography, assets, and responsive behavior.
- [ ] Run `npm test`, `npm run lint`, `npm run type-check`, production-shaped `npm run build`, and `git diff --check`.
- [ ] Review the final diff and record remaining deployment/browser gates before committing.
