# October 5 commit plan

Execution authorized by the user on October 5. Three code checkpoints created; the documentation checkpoint follows. No push or deployment authorized.

## Inspected state

Repository: `implementation`; branch `feature/saathi-interface-refresh`; HEAD `9d82996`. Git reports three commits ahead of the locally stored tracking ref; no fetch was performed, so remote state is not freshly verified. Existing local checkpoints include `4dcd78d`, `d8de19b` and `9d82996`. Index is empty at inspection.

Do not rewrite those commits. Preserve unrelated dirty work. Ordinary tracked diff statistics omit the new hook, Board wrapper, paging contracts/tests and documents; review their contents explicitly.

## Commit 1: fresh authorization batching

Message: `perf: batch fresh workspace authorization checks`

Explicit files:

- `app/api/realtime/route.ts`
- `app/api/realtime/poll-cost.test.cjs`
- `lib/sse-authorization.ts`
- `lib/sse-authorization.test.ts`
- `lib/auth-simple.ts`
- `docs/release/2026-10-05-performance-followup.md`
- `docs/release/2026-10-05-distinct-user-load-evidence.md`
- `docs/release/2026-10-04-startup-performance-evidence.md`

Keep fresh batching, phase diagnostics and their tests together. Diagnostics remain opt-in; no auth freshness or admission changes. Evidence describes dated measurements, not an independently repeated benchmark at commit time.

## Commit 2: bounded Board reads and integration

Message: `feat: paginate Board tasks with server filters and workspace totals`

Explicit files:

- `lib/task-page.ts`
- `lib/task-page.test.ts`
- `lib/data/tasks.ts`
- `lib/data/task-page.test.ts`
- `app/tasks/actions.ts`
- `hooks/use-task-board.ts`
- `hooks/use-task-board.test.cjs`
- `hooks/use-workspaces.ts`
- `hooks/workspace-sync.test.cjs`
- `hooks/workspace-edit-version.test.cjs`
- `components/workspace-board.tsx`
- `components/task-list.tsx`
- `components/task-filter.tsx`
- `components/dashboard-navigation-behavior.test.cjs`
- `app/dashboard/page.tsx`
- `package.json`
- `docs/architecture/2026-10-04-pagination-retention.md`

Server contracts, consuming UI, complete Overview behavior, by-ID reads, stale guards, mutation refresh and test registration form one working slice. Do not split the action contract from its callers. Include the small filtered-empty/conflict copy fixes in this commit because they share the paged editor integration file; retrospective hunk staging adds risk without useful independence. No new dependency or lockfile change is expected in this checkpoint.

## Commit 3: focused loading and accessibility improvements

Message: `fix: improve task feedback and member layout accessibility`

Explicit files:

- `components/member-manager.tsx`
- `components/member-manager.test.cjs`
- `components/task-comments.tsx`
- `components/task-quick-add.tsx`
- `components/task-quick-add.test.cjs`
- `components/workspace-overview.tsx`
- `components/workspace-overview-behavior.test.cjs`
- `docs/release/2026-10-05-paging-ux-evidence.md`
- `docs/release/2026-10-05-paged-board.jpg`
- `docs/release/2026-10-05-mobile-board.jpg`

This preserves the delivered loading/feedback/wrapping improvements; it does not claim that the planned visual redesign has been implemented. Combined evidence intentionally follows Commit 2. Inspect the two named screenshots for identifiers and sensitive content before staging; omit them and adjust document references if unsuitable. No wildcard browser-evidence staging.

## Commit 4: consolidated direction and execution plan

Message: `docs: define core simplification and human UX execution plan`

Explicit files:

- `docs/architecture/2026-10-05-remaining-work-and-stack-review.md`
- `docs/architecture/2026-10-05-stack-practices-research.md`
- `docs/superpowers/plans/2026-10-05-saathi-core-simplification-and-human-ux.md`
- `docs/release/2026-10-05-commit-plan.md`

The plan includes a visual prototype review before production UI work, conditional library adoption and measurable deletion gates. Mark planned outcomes as planned. Preserve dated evidence as a snapshot; record actual resulting hashes in this commit plan when executing.

## Excluded work

Leave these out unless separately reviewed and selected:

- `README.md`
- `docs/architecture/saathi-v1-project-map.md`
- `docs/architecture/saathi-v1-technical-architecture.md`
- `docs/handbook/`
- `docs/interviews/saathi-three-day-mastery-and-showcase-guide.md`
- `docs/superpowers/plans/2026-09-21-saathi-production-readiness-closeout.md`
- October 4 screenshots and the untracked `docs/release/browser-evidence/` directory
- `.local-test/`, credentials, environment files, raw logs and build outputs

## Execution checks

1. Obtain explicit commit authorization, inspect tracked and new file contents, and confirm the manifests still match the intended changes.
2. Refresh type checking, lint, the registered suite, appropriate database checks and production build. Last recorded integrated result was 244 passing tests/two skips, with types/lint/build passing; that is prior evidence, not a fresh run in this planning turn.
3. Validate intermediate trees: Commit 1 should pass against current HEAD; Commit 2 should pass without Commit 3; Commit 3 completes the combined UI checkpoint. Use a disposable index snapshot/checkout for these checks if needed, preserving the dirty working tree. Checking the complete worktree alone does not prove intermediate commits build.
4. Stage each explicit manifest in order, inspect `git diff --cached`, run the staged whitespace check and commit only that group. Never use `git add .` or include private fixture artifacts. Stop if an intermediate dependency contradicts the proposed split and revise the manifest.
5. Confirm final committed files, resulting hashes and excluded work status. Do not require a clean worktree by discarding unrelated drafts.
6. Push remains a separate authorization. Before an authorized push, inspect automatic deployment behavior, fetch and compare divergence, review all outgoing commits, and use a normal push to the existing feature branch. Do not force push or merge main implicitly.

Suggested future implementation boundaries are already in the consolidated plan. Do not create empty commits for planned query adoption, Activity continuation or the visual redesign: commit those only after implementation and verification.

## Executed checkpoints

- cb8b484: fresh authorization batching; isolated snapshot 234 tests passed, two skipped; type checking passed.
- 6edfd2c: Board pagination; isolated snapshot 241 tests passed, two skipped; type checking passed.
- 6a518c5: feedback/accessibility; integrated suite 244 tests passed, two skipped. Fresh type checking, lint and production build passed. Focused live test DB pagination check passed (one test, no skips), with fixture cleanup.
- Screenshot inspection found only disposable QA content in the two selected images. No credentials or private user content staged.
- The final documentation commit records the plan and this execution ledger. Its hash is reported after creation rather than embedded recursively.
- Intermediate snapshots were checked with tests/types; the production build was run on the final integrated application, not separately for each snapshot.
