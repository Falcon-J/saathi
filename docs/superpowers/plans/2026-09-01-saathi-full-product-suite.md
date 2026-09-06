# Saathi Full Product Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one calm, light, board-first Saathi visual system across landing, authentication, dashboard, task/workspace interactions, and responsive/recovery states without changing product contracts.

**Architecture:** Keep the existing Next.js App Router, Tailwind v4, shadcn/Radix, and Lucide stack. Make the global semantic tokens the single visual authority; use a bespoke inline SVG mark; then refactor the existing page and component surfaces to consume those tokens. Server actions, Redis Streams, SSE, workspace policy, session, and route contracts remain unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/Radix primitives, Lucide React, Node test runner, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-09-01-saathi-product-design-design.md`

## Global Constraints

- Do not add a UI framework, a dependency, a new route, a backend rewrite, or a replacement for Redis/SSE.
- Use warm neutral `#F5F5F7` and `#FFFFFF` surfaces, graphite `#1D1D1F` text, blue `#007AFF` primary actions, green `#34C759` live/success states, amber attention, and red destructive/error states.
- Use the existing 8px rhythm; labels use 4px radius, controls 6px, cards 8px, and containers 12px.
- Build the new logo as an original inline SVG “shared path” mark. Do not ship an AI raster, stock icon, four-tile diamond, generic infinity loop, or copied branding.
- Keep one primary action per surface. Use inline feedback for contextual/recoverable form errors and a single themed toast only for cross-surface events.
- Preserve authentication, authorization, workspace/task mutation, optimistic update, SSE, and `/tasks` redirect behavior.
- Do not stage, commit, push, deploy, or remove the pre-existing untracked `.kiro/`, `.playwright-cli/`, or `docs/superpowers/` content unless the user separately authorizes it.

---

### Task 1: Establish shared light tokens and the original Saathi mark

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `components/saathi-logo.tsx`
- Create: `components/saathi-logo-mark.tsx`
- Modify: `app/dashboard/design-tokens.test.cjs`

**Interfaces:**
- Produces: global semantic CSS variables used by every public/authenticated surface and `<SaathiLogoMark aria-hidden />` used only by `SaathiLogo`.
- Preserves: `SaathiLogoProps` (`className`, `imageClassName`, `priority`) so existing callers do not change.

- [ ] **Step 1: Extend the token regression test before changing CSS.**

  Add assertions for the shared light token values and a global primary action colour:

  ```js
  test("shared Saathi tokens provide the approved light system", () => {
    for (const [token, value] of Object.entries({
      "--background": "#f5f5f7",
      "--foreground": "#1d1d1f",
      "--primary": "#007aff",
      "--saathi-success": "#34c759",
      "--saathi-danger": "#ff3b30",
    })) {
      assert.match(globalsCss, new RegExp(`${token}:\\s*${value}`))
    }
  })
  ```

- [ ] **Step 2: Run the focused test and confirm the current dark global theme fails the new expectation.**

  Run: `node --test app/dashboard/design-tokens.test.cjs`
  Expected: FAIL because `:root` still defines the dark palette.

- [ ] **Step 3: Make the root semantic tokens light and remove dark-only presentation from shared shell classes.**

  In `app/globals.css`, move the currently dashboard-local semantic values into `:root`; make `.dark` use the same product tokens so system theme selection cannot restore the old neon dashboard; replace `.saathi-shell` gradients and `.saathi-grid` usage with plain neutral surfaces; retain semantic Tailwind mappings in `@theme inline`.

  Keep these values authoritative:

  ```css
  :root {
    --background: #f5f5f7;
    --foreground: #1d1d1f;
    --card: #ffffff;
    --primary: #007aff;
    --ring: #007aff;
    --saathi-success: #34c759;
    --saathi-warning: #ff9f0a;
    --saathi-danger: #ff3b30;
  }
  ```

  In `app/layout.tsx`, make the light appearance deterministic by setting the existing `ThemeProvider` to `defaultTheme="light"` and disabling system-driven dark styling; do not remove the provider.

- [ ] **Step 4: Replace the raster-dependent logo implementation with a bespoke SVG mark.**

  Create `components/saathi-logo-mark.tsx` with one `viewBox="0 0 32 32"` SVG. Construct two rounded paths that meet once and leave a forward-facing negative-space opening. Use `currentColor`, `fill="none"`, rounded linecaps/linejoins, and no filter, image, gradient, or shadow.

  Update `SaathiLogo` to render that mark inside the existing sized container rather than `next/image`. Keep `imageClassName` accepted for compatibility, but apply it to the SVG wrapper and do not require `/saathi-logo-mark.png`.

- [ ] **Step 5: Run focused verification.**

  Run: `node --test app/dashboard/design-tokens.test.cjs`
  Expected: PASS.

  Run: `npm run type-check`
  Expected: PASS with no `SaathiLogo` caller changes.

- [ ] **Step 6: Review only this task's diff; create a commit only after explicit user authorization.**

  Run: `git diff --check` and `git diff -- app/globals.css app/layout.tsx components/saathi-logo.tsx components/saathi-logo-mark.tsx app/dashboard/design-tokens.test.cjs`.

### Task 2: Replace the public landing page with the minimal board-first entry

**Files:**
- Modify: `app/landing/page.tsx`
- Create: `app/landing/landing-content.test.cjs`

**Interfaces:**
- Consumes: global tokens and `SaathiLogo` from Task 1.
- Produces: a public landing page with navigation to `/login` and `/register`; no server/data dependency.
- Preserves: root routing via `app/page.tsx` and all existing CTA destinations.

- [ ] **Step 1: Add a content-contract test before the page rewrite.**

  Create a Node test that reads `page.tsx` and asserts the approved primary labels and the removal of deprecated visual language:

  ```js
  const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8")
  assert.match(source, /Move work forward\./)
  assert.match(source, /Create a workspace/)
  assert.match(source, /href="\/login"/)
  assert.match(source, /href="\/register"/)
  assert.doesNotMatch(source, /saathi-hero-texture/)
  assert.doesNotMatch(source, /Live engine|Command center|SSE task updates/)
  ```

- [ ] **Step 2: Run the test and confirm it fails against the current dense landing page.**

  Run: `node --test app/landing/landing-content.test.cjs`
  Expected: FAIL because the current page uses the texture and technical/command-center content.

- [ ] **Step 3: Rebuild `LandingPage` with only the approved hierarchy.**

  Keep a compact navigation with the SVG logo, `Sign in`, and a blue `Create a workspace` action. Replace the hero/stat/feature-card architecture with:

  ```tsx
  <section aria-labelledby="landing-title">
    <h1 id="landing-title">Move work forward.</h1>
    <p>A focused workspace for teams that build together.</p>
    <Button asChild><Link href="/register">Create a workspace</Link></Button>
  </section>
  ```

  Add one static, semantic product preview with exactly `To do`, `In progress`, and `Done` columns, followed by a three-item plain benefit row. Do not add fake performance metrics, use `saathi-hero-texture.png`, create nested dashboard panels, or use generated art as a page asset.

- [ ] **Step 4: Run the content contract and visual smoke checks.**

  Run: `node --test app/landing/landing-content.test.cjs`
  Expected: PASS.

  Run: `npm run type-check`
  Expected: PASS.

  Manually verify at 1440px and 390px: header actions remain visible, board preview does not overflow, and no horizontal scrollbar appears.

- [ ] **Step 5: Review this task's diff; commit only with user authorization.**

  Run: `git diff --check` and inspect `app/landing/page.tsx` plus the new test.

### Task 3: Redesign login and signup around a focused form and inline recovery

**Files:**
- Modify: `components/auth-form.tsx`
- Modify: `app/(auth)/login/page.tsx` only if page-level metadata/landmarks are needed
- Modify: `app/(auth)/register/page.tsx` only if page-level metadata/landmarks are needed

**Interfaces:**
- Consumes: `login`, `signup`, router replacement, and `useNotifications` without changing their return contracts.
- Produces: light login/signup forms with form-local errors and existing successful redirect to `/dashboard`.
- Preserves: email, username, password, confirm-password validation and disabled/loading behavior.

- [ ] **Step 1: Add a form-local error state before changing the markup.**

  In `AuthForm`, add `const [formError, setFormError] = useState<string | null>(null)`. Clear it at submit start. Replace missing credentials, invalid signup details, service errors, and thrown auth errors with `setFormError(message)`; retain the success notification for a successful route transition.

- [ ] **Step 2: Preserve the authentication control flow while making error rendering observable.**

  Render the state below the form and above the account-switch link:

  ```tsx
  {formError && (
    <p role="alert" className="rounded-[var(--saathi-radius-control)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {formError}
    </p>
  )}
  ```

  Do not render duplicate error toasts for the same validation/auth result.

- [ ] **Step 3: Replace only the visual shell and informational content.**

  Remove `saathi-grid`, “Workspace gateway”, the technical signal list, monospace field styling, and dark panels. Use a white form card on the global neutral canvas. On `lg` and above show one quiet static board preview; below `lg` hide the preview and keep the form centered. Use `Welcome back` for login and `Create your workspace` for signup.

- [ ] **Step 4: Validate behavior, not only appearance.**

  Run: `npm run type-check`
  Expected: PASS.

  Browser checks: submit empty login; submit mismatched signup passwords; submit a valid local test account; confirm exactly one local alert per failed submission and redirect after a successful submission.

- [ ] **Step 5: Review this task's diff; commit only with user authorization.**

  Run: `git diff --check` and inspect `components/auth-form.tsx`.

### Task 4: Simplify the dashboard shell and make the board the primary surface

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/dashboard-navigation.tsx`
- Modify: `lib/dashboard-navigation.ts` only if navigation section IDs change
- Modify: `components/dashboard-navigation.test.ts` if IDs change
- Modify: `components/usage-summary.tsx` only to make it visually secondary; do not remove its API/usage behavior

**Interfaces:**
- Consumes: `useWorkspaces`, `InvitationNotifications`, `TaskList`, `MemberManager`, `UsageSummary`, and realtime connection state.
- Produces: the same dashboard section IDs and working navigation with a compact header, rail, board, and secondary team/activity region.
- Preserves: workspace switching/creation, rename permissions, task handlers, invitation refresh, reconnect, logout, and owner semantics.

- [ ] **Step 1: Keep the existing navigation behavior covered before layout changes.**

  Run: `node --experimental-strip-types --test --test-isolation=none components/dashboard-navigation.test.ts`
  Expected: PASS.

- [ ] **Step 2: Replace the dashboard header and grid hierarchy without changing handler wiring.**

  Keep the current calls to `handleAddTask`, `handleToggleTask`, `handleEditTask`, `handleDeleteTask`, `addMember`, `removeMember`, and `realtime.connect`. Recompose their existing UI into:

  ```tsx
  <header>{/* compact logo, account menu, logout */}</header>
  <aside>{/* 64-80px desktop rail */}</aside>
  <section id="workspace-header">{/* title, member avatars, live state, Add task */}</section>
  <section id="project-board">{/* dominant board */}</section>
  <aside id="team-panel">{/* Team, invitation, activity, usage */}</aside>
  ```

  Remove completion as a dominant card; if retained, show it as a quiet summary beside the workspace title. Keep Team and Realtime/Usage below the board's visual priority, never overlapping it.

- [ ] **Step 3: Make the live/offline state an inline recovery banner.**

  When `realtime.error` is present, render a single amber `role="status"` banner above `TaskList` with the existing reconnect callback. Retain the non-error Live/Offline indicator in the header. Do not show the technical “one persistent stream” copy to users.

- [ ] **Step 4: Update navigation only if visual hierarchy needs it.**

  Keep `workspace-header`, `project-board`, `team-panel`, and `realtime-panel` as valid scroll targets. On mobile, use the existing compact navigation form and do not create dead buttons. If an item is renamed from “Realtime” to “Activity”, update `DashboardSectionId`, the test fixture, and matching `id` together.

- [ ] **Step 5: Run focused checks.**

  Run: `node --experimental-strip-types --test --test-isolation=none components/dashboard-navigation.test.ts`
  Expected: PASS.

  Run: `npm run type-check`
  Expected: PASS.

  Browser checks at 1440px: each rail item scrolls to its target; Add task opens the existing form; Team remains secondary; Live/Offline remains understandable without a modal.

- [ ] **Step 6: Review this task's diff; commit only with user authorization.**

  Run: `git diff --check` and inspect the dashboard/navigation files only.

### Task 5: Polish task CRUD, workspace membership, and feedback at their authoritative UI boundaries

**Files:**
- Modify: `components/task-list.tsx`
- Modify: `components/member-manager.tsx`
- Modify: `components/workspace-name-inline-editor.tsx`
- Modify: `components/workspace-switcher.tsx`
- Modify: `components/confirm-dialog.tsx`
- Modify: `components/ui/toast.tsx`
- Modify: `hooks/use-notifications.ts` only if required to prevent duplicate notifications
- Run: `lib/task-draft.test.ts`, `lib/mutation-result.test.ts`, `hooks/notification-variant.test.ts`

**Interfaces:**
- Consumes: existing `TaskUpdate`, task mutation callbacks, member email-based remove contract, `ConfirmDialogProps`, and notification variants.
- Produces: compact task cards/columns, clear editor states, workspace/team controls, and one feedback channel per outcome.
- Preserves: server action inputs, optimistic update/recovery behavior, workspace owner/member permission rules, and destructive confirmation semantics.

- [ ] **Step 1: Verify the existing mutation boundary tests before visual refactoring.**

  Run: `node --experimental-strip-types --test --test-isolation=none lib/task-draft.test.ts lib/mutation-result.test.ts hooks/notification-variant.test.ts`
  Expected: PASS.

- [ ] **Step 2: Reduce board-card density in `TaskList` without changing task data.**

  Keep the existing task editor dialog and `buildTaskUpdate` path. In each task card, show title, compact assignee, one status/priority chip, and due date; keep description and creation metadata inside the edit dialog. Preserve filters and the three columns `todo`, `in-progress`, and `done`.

- [ ] **Step 3: Make form errors local and destructive actions explicit.**

  Keep `editError` in the task editor dialog and style it with semantic red tokens. Keep `ConfirmDialog` for delete/remove/leave actions; update its layout to use a clear title, consequence copy, secondary Cancel, and red action. Do not trigger a second destructive toast after a dialog already explains a failure.

- [ ] **Step 4: Simplify workspace/member controls while preserving authorization.**

  Keep `isOwner` and `canRemoveMember` logic unchanged. Render the owner/member role as small lozenges, show the in-app invitation copy beside the invite field, and use `lastError` inline beneath that field. In the inline workspace name editor, surface validation/save failure adjacent to the input instead of creating another toast for the same interaction.

- [ ] **Step 5: Ensure toasts cannot recreate the current stack problem.**

  Retain themed toast variants but cap the visible viewport to one active toast and ensure the viewport uses the same white/light semantic surfaces. `useNotifications` should not emit a toast when its caller has already rendered an inline error or success message.

- [ ] **Step 6: Run focused regressions.**

  Run: `node --experimental-strip-types --test --test-isolation=none lib/task-draft.test.ts lib/mutation-result.test.ts hooks/notification-variant.test.ts`
  Expected: PASS.

  Browser checks: add task; edit title/status/assignee; move/complete task; delete task with cancel and confirm; rename workspace; invite member with invalid and valid email; remove member. Confirm that each failure/success appears only once.

- [ ] **Step 7: Review this task's diff; commit only with user authorization.**

  Run: `git diff --check` and inspect the listed UI files.

### Task 6: Deliver responsive, empty, and recovery states plus full release validation

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `components/task-list.tsx`
- Modify: `components/dashboard-navigation.tsx`
- Modify: `components/auth-form.tsx`
- Modify: `app/dashboard/design-tokens.test.cjs` only if a new semantic state token is introduced
- No route change: `app/tasks/page.tsx` remains a redirect to `/dashboard`

**Interfaces:**
- Consumes: existing loading/error/realtime fields from `useWorkspaces` and existing auth route contract.
- Produces: deliberate mobile layouts, empty workspace/board affordances, and non-blocking retry states.
- Preserves: retry callbacks, the dashboard redirect guard, and legacy `/tasks` compatibility.

- [ ] **Step 1: Implement one-action empty states.**

  Keep the existing no-workspace call to `createWorkspace("Launch Workspace")`, but present it with heading `Start with a workspace`, short copy, and one `Create workspace` action. For an empty board, keep `TaskList`'s existing add-task handler but show `Start with your first task` with one Add task action per visible board.

- [ ] **Step 2: Implement responsive rules rather than shrinking desktop panels.**

  At `< lg`, hide the desktop rail, use the existing compact navigation, render board columns as horizontally selectable status tabs or one controlled column, move Team/Activity behind a clearly labelled section, and retain a minimum 44px interactive target. At `>= lg`, retain the three-column board and secondary side panel.

- [ ] **Step 3: Verify the dashboard and public routes.**

  Run: `npm test`
  Expected: PASS.

  Run: `npm run lint`
  Expected: no new errors; record pre-existing warnings separately.

  Run: `npm run type-check`
  Expected: PASS.

  Run: `npm run build`
  Expected: PASS.

- [ ] **Step 4: Run representative browser and production checks.**

  Validate `/`, `/login`, `/register`, `/dashboard`, and `/tasks` at 1440px and 390px. Exercise empty workspace, empty board, offline/retry, task CRUD, member invite/remove, and logout. On the deployed URL, verify both the root response and login response before calling the product release-ready; if Redis/session configuration produces a 500, record it as a deployment blocker rather than masking it in UI.

- [ ] **Step 5: Perform final review; commit/push only with explicit user authorization.**

  Run: `git diff --check`, `git status --short`, and manually inspect the final diff. Stage only files in the approved implementation slice when authorized; preserve `.kiro/`, `.playwright-cli/`, and existing `docs/superpowers/` files.

## Spec Coverage Self-Review

- Shared tokens, exact palette, spacing/radius, original SVG logo: Task 1.
- Minimal landing and preserved auth routes: Task 2.
- Light login/signup with inline recovery: Task 3.
- Board-first desktop shell, ownership, team/activity hierarchy, Live/Offline: Task 4.
- Task CRUD, workspace rename/invite/remove, destructive confirmation, non-stacking feedback: Task 5.
- Loading/empty/offline/mobile states, `/tasks` compatibility, type/build/browser/deployment evidence: Task 6.

No dependency, backend, data-contract, or route replacement is included. The trademark availability search is a release gate outside source-code implementation.
