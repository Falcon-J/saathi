# Workspace UX simplification evidence

## Approved scope
Keep Overview then Board as the main journey. Primary navigation is Overview, Board, Team. Activity and owner-only Settings live in the workspace menu. The header retains the workspace selector, New task and profile menu. AI is optional and opens as Ask Saathi inside the workspace; there is no Assistant mode or unavailable landing page.

Overview shows compact progress, title-first quick add, attention groups and completed tasks collapsed by default. View all tasks opens Board. Board uses the same quick add with optional details and puts CSV import in its actions menu. Existing full editor and mutation permissions remain in use.

## Verification
- Final automated suite: 230 passed, 2 existing integration skips, 0 failed.
- Type checking and lint passed. Production build passed. Local production Redis runtime remains a separate previously documented gate.
- Chrome owner: primary navigation and content agree; Activity selects no primary item; New task from Activity opens Overview and focuses title; title-only creation and completion persisted; detailed creation retained description, high priority and 25-minute estimate in the full editor; reload retained tasks. CSV overflow opens Import tasks dialog.
- In-app browser member: owner Settings is absent; owner-created tasks retain permission restrictions; both Chrome-created tasks are visible without manual reload.
- Responsive in-app browser: mobile primary navigation is visible; measured client width and scroll width both 375px. Temporary viewport overrides were reset. Chrome override did not change its DOM width and was not used as mobile proof.
- Completed disclosure has no open attribute. Ask Saathi entry is absent with AI disabled. Enabled provider interaction was not exercised; existing advisor confirmation and feature-flag tests remain in the suite.
- Review caught a draft-loss path when a reconciliation refresh failed. Read errors now render alongside the task views, keeping the quick-add draft and uncertainty guard mounted. Explicit refresh returns success/failure, and reconciliation unlocks only after a successful read. Workspace keys scope drafts. Automated form, hook and lifecycle regressions cover these boundaries.

## Test records and screenshots
The existing authorized test workspace received two tasks: QA simplified quick add Oct 04 (completed), and QA detailed quick add Oct 04 (description, high priority, 25-minute estimate). No existing tasks were deleted or changed.
Screenshots: 2026-10-04-simplified-overview.jpg and 2026-10-04-simplified-mobile.jpg. These contain synthetic test workspace/task labels. Review images before including them in a commit.

## Boundaries
No database/schema or deployment changes were needed for this UX work. No commit, push or deployment was performed. The existing core commit plan and source manifest include the UX files; inspect combined changes before staging.
