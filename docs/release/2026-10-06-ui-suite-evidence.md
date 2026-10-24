# UI suite evidence and remaining gates

Scope: Compact B dashboard refresh on `feature/saathi-interface-refresh`, starting at `9da6551` with the current uncommitted UI and documentation changes. This record separates deterministic local checks from rendered-browser and hosted acceptance.

## Current evidence

| Area | Evidence | Result |
| --- | --- | --- |
| GitHub UI issue queue | Authenticated `Falcon-J/saathi` Issues page, checked 2026-10-07 | Open (0); no current UI issue to triage |
| Registered local suite | `npm test` on the current worktree | 256 tests: 254 passed, 0 failed, 2 skipped when run with process permission; the database preflight subprocess is blocked by the restricted sandbox otherwise |
| Type and lint | `npm run type-check -- --incremental false`; focused ESLint on Playwright config and spec | Passed |
| Public auth browser checks | `npm run test:e2e` with desktop Chromium and 360px mobile Chromium projects | 14 passed across sign-in, registration, password request, and expired reset-link screens; includes keyboard order, password reveal, no horizontal overflow, protected dashboard redirect, and axe scans |
| Public auth accessibility | Axe found sign-in submit/helper text contrast below 4.5:1; `components/auth-form.tsx` now uses darker accessible colors | Public auth screens pass desktop and 360px mobile axe scans with zero serious or critical findings; this is not a whole-product accessibility audit |
| Production build | `npm run build` after the workspace timezone deadline changes | Passed; 13 static pages generated |
| Patch hygiene | `git diff --check` | Passed; only Git line-ending notices |
| Activity UI states | `components/activity-history.test.cjs` | Loading, retryable error, empty record, stale workspace response, and immediate workspace-scope isolation covered; 3 focused tests pass |
| Mobile navigation contract | `components/dashboard-navigation-behavior.test.cjs` | Labels, active route, focus-visible styling, and no-workspace hiding covered; 4 focused tests pass |
| Compact desktop navigation rail | `app/dashboard/page.tsx` | Reduced rail width from 192px to 160px, keeping labelled navigation and existing touch targets; navigation tests, type-check, and focused ESLint pass |
| Board filter controls | `components/task-filter.test.cjs` | Accessible names, selected status state, controlled search, status, priority, assignee, and clear-search callbacks covered; 1 focused test passes |
| Board paging, card hierarchy, and deadline display | `components/task-list-paging.test.cjs`, `lib/task-overview.test.ts` | Labels workspace totals separately, signals remaining pages in empty columns, removes repeated card metadata while preserving status control naming, and passes the workspace IANA timezone to due-time formatting; focused tests pass |
| Overview deadline grouping | `lib/task-overview.test.ts` | Precise instants group by workspace-local calendar date near midnight; date-only commitments remain literal; Kolkata and Los Angeles boundaries pass |
| Capability-aware workspace creation | `components/workspace-create-form.test.cjs` | AI promotion/sample content is absent when AI is disabled and remains available when enabled; 1 focused test passes |
| Task editor conflict/read-only presentation | `components/task-editor-dialog.test.cjs` | Conflict error has an alert role and draft recovery guidance; title/description remain visible; read-only fields are disabled and Save is absent; 2 tests pass |
| Task conflict/recovery mechanics | `hooks/workspace-edit-version.test.cjs`, `hooks/use-task-board.test.cjs`, `components/task-quick-add.test.cjs`, `components/task-comments.test.cjs`, `components/workspace-overview-behavior.test.cjs`, `lib/task-draft.test.ts` | Version capture, stale-read handling, rollback, uncertain outcomes, draft retention, and retry/reconciliation have deterministic coverage in the passing suite |
| Mobile sign-in rendering | [390px screenshot](browser-evidence/2026-10-06-mobile-login-390.png), [keyboard focus screenshot](browser-evidence/2026-10-06-mobile-login-390-keyboard.png), [run details](browser-evidence/2026-10-06-mobile-sign-in.md) | Local production build at 390 × 844; sign-in controls fit and Tab traverses them in order |
| Current 360px mobile sign-in render | [Production screenshot](browser-evidence/2026-10-06-mobile-login-360.png) | Captured from the current production build at 360 × 780 after the contrast fix; controls fit without a development overlay |
| Authenticated desktop workspace | Earlier local Chrome run against QA workspace `QA Two Browser Collaboration Oct 04` | Overview, Board, Team, and Activity rendered; navigation worked; Redis unavailable so live updates were offline |

No database, server contract, feature flag, or hosted setting changed.

## Still open

| Requirement | What is missing |
| --- | --- |
| Authenticated dashboard at mobile width | Playwright’s isolated browser redirects `/dashboard` to login because it has no disposable session. The SQL-only local fixture does not exercise Supabase Auth. The signed-in personal Chrome session was not copied into the test browser. Existing 2026-10-04 dashboard screenshots are prior evidence, not proof of the current mobile render. |
| Authenticated desktop/mobile task journeys | No authorized disposable owner/member/outsider session fixture. Sign-in and unauthenticated redirect are now repeatable in desktop and 360px mobile Chromium; no auth bypass or personal session reuse was added. |
| Realtime recovery in browser | Local Redis was unavailable during the authenticated dashboard run. Offline status was visible; reconnect, missed-event reconciliation, and two-user observation remain unverified here. |
| Hosted release acceptance | Deployed SHA, hosted authentication/database, email delivery, two-user collaboration, Redis/SSE recovery, backup/restore, and production logs remain gates in the separate production readiness plan. |
| Interaction policy review | Inline filter disclosure, dirty-draft navigation confirmation, detail-dialog close policy, and labeling native date/time entry with the browser timezone remain proposed decisions requiring review. Workspace-local deadline display and grouping are implemented and covered. |

No commit, push, deployment, hosted-data mutation, or database integration run was performed for this UI evidence update.
