# Core checkpoint commit and push plan

Repository: `implementation`. Current branch: `feature/saathi-interface-refresh`, tracking `origin/feature/saathi-interface-refresh`. Inspected HEAD: `4dcd78d`. Local implementation checkpoint created as `d8de19b` after authorization. Documentation is being checkpointed separately. No push or deployment has been performed.

## Commit 1: working core and regression checks

Implementation commit: `d8de19b` — `fix: harden core reliability and simplify workspace task flows`.

Use the explicit relative-path manifest `docs/release/2026-10-04-core-code-staging.txt`. It covers the accumulated approved core implementation and tests, including command receipts and migration0007, shared domain contracts, read coordination, feature capabilities, archive and discussion flows, Redis recovery, SSE authorization sharing, comment paging, outbox retention, migration journal tooling and test registration. Keep the migration, schema, receipt writes and consuming actions in the same commit. Shared edited files make retrospective feature-by-feature staging risky; this atomic checkpoint is the safer integration unit.

Before staging, inspect every manifest entry and its diff. Existing changes from earlier work are intentionally part of this core checkpoint, not attributed exclusively to this closeout. Refresh the manifest explicitly if the reviewed scope changes. Do not use blanket `git add .` or `git add -A`.

After explicit authorization, in the repository:

```powershell
git diff --check
git add --pathspec-from-file=docs/release/2026-10-04-core-code-staging.txt
git diff --cached --stat
git diff --cached
git commit -m "fix: harden core mutations, realtime delivery and history reads"
```

Review both tracked and newly added files before committing; ordinary `git diff` alone excludes untracked content. Confirm no credential values, private environment files, build artifacts or local test logs were staged.

## Commit 2: requirements, evidence and remaining gates

Suggested message: `docs: record core verification and release follow-up gates`.

Stage these reviewed documents explicitly:

- `docs/architecture/2026-10-04-core-foundation-review.md`
- `docs/architecture/2026-10-04-pagination-retention.md`
- `docs/migration-journal-reconciliation.md`
- `docs/release/2026-10-04-core-audit-fix-evidence.md`
- `docs/release/2026-10-04-engineering-baseline-evidence.md`
- `docs/release/2026-10-04-core-closeout-evidence.md`
- `docs/release/2026-10-04-startup-performance-evidence.md`
- `docs/release/2026-10-04-workspace-ux-evidence.md`
- `docs/release/2026-10-04-core-code-staging.txt`
- `docs/release/2026-10-04-commit-push-plan.md`
- `docs/superpowers/plans/2026-10-04-core-audit-fixes.md`
- `docs/superpowers/plans/2026-10-04-saathi-v1-engineering-baseline.md`
- `docs/superpowers/specs/2026-10-04-saathi-v1-engineering-baseline-design.md`

Prior browser evidence contains test account identifiers. Inspect images and CSV content before deciding whether to include them; their inclusion is not automatic. Keep the existing interview guide and September21 production readiness draft outside these commits unless separately selected. `.local-test`, `.env.local`, `.next` and credentials remain excluded.

## Push

After both commits, fetch the remote, inspect ahead/behind and run the relevant verification if upstream integration changes code. If there is divergence, inspect it and integrate deliberately; never force push to resolve it. Then, with push authorization:

```powershell
git fetch origin
git rev-list --left-right --count HEAD...origin/feature/saathi-interface-refresh
git log --oneline origin/feature/saathi-interface-refresh..HEAD
git push origin HEAD:feature/saathi-interface-refresh
```

Confirm the remote branch points to the new HEAD. A successful Git push is not deployment or production acceptance. Inspect the remote project's automatic deployment configuration before pushing so the separate deployment-day boundary remains respected.

## Verification and release boundaries

Consult the closeout evidence for measured results and limitations. Task Board server paging, full activity continuation, hosted worker scheduling, distributed multi-user capacity and hosted recovery remain distinct follow-up gates. They should be tracked as explicit work, not hidden by the checkpoint commit or described as complete.

The source manifest now includes the profile read sharing and atomic SSE admission fixes. Before deployment, enforce the lease-format drain gate in the startup evidence: never overlap old-format and v2 connections during an in-place rollout. The planned fresh Redis deployment avoids that overlap.

The UX simplification is part of the pending code checkpoint. The source manifest includes its shared quick-add component and navigation regressions. Review the UX evidence and optional screenshots before staging. Local commits were authorized by the user. Push still requires separate authorization.

Checkpoint verification: 230 automated checks passed, two integration checks skipped; fresh type checking, lint and staged whitespace checks passed. README additions referencing excluded interview/release drafts remain unstaged, alongside those drafts and browser images.
