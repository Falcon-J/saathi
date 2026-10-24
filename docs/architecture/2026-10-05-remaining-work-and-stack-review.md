# Saathi remaining work and framework adoption review

Reviewed 2026-10-05. Repository investigation and proposed sequence only. No application code, dependencies, commits, pushes or deployments changed in this review.

## Evidence rules

Use the October 4 approved engineering baseline for requirements and dated execution records for results. An unchecked historical plan is not proof that work remains undone. A passing unit test or local provider fixture is not hosted acceptance. This review reads recorded results; it does not rerun prior suites or inspect live provider configuration.

## Remaining plan ledger

| Area | Current evidence | What remains | Track |
| --- | --- | --- | --- |
| Core collaboration and roles | October 4 browser/database records cover owner/member task details, comments, assignment, completion, stale edits, CSV, ownership and archive flows | Consolidate FR01-FR13 into one current journey ledger including negative and recovery cases; close every unverified row | Core acceptance |
| Board and comments paging | October 5 Board and October 4 comment paging implemented and tested with 137-record fixtures | Broader filter/race browser cases; do not redo implementation solely because historical plans say pending | Core acceptance |
| Activity history | lib/data/activity.ts returns newest 50, maximum 100, no continuation | Authorized cursor API and Load older activity, including tied timestamps, archived reads and revoked membership | Functional gap |
| Requirements consistency | Product requirements use in_progress; public TaskStatus contract uses in-progress | Document storage/API mappings and establish one public vocabulary; no blind rename of database values | Contract gap |
| Overview and AI projections | Overview still reads complete tasks; AI is not fed a visible Board page | Measure 10/100/1000 task datasets and actual completeness needs before changing these projections | Performance |
| Performance NF03-NF05 | Short 20-user/100-connection test delivered 500/500; latest synthetic p95 1007ms | 100 distinct users, at least 15 minutes and 1000 measured operations/events, task API p95 <=750ms, durable commit-to-observer p95 <=2s, unexpected failure rate <1% | NFR acceptance |
| Revocation and reconnect NF06-NF07 | Unit/database guards and short recovery evidence exist | Timed open-stream member removal <=30s and browser authoritative reconciliation <=5s under representative load | NFR acceptance |
| Accessibility NF08 | Labels, larger controls, wrapping and 360px smoke checks recorded | Repeatable automated accessibility plus full keyboard journey; real new-user feedback separately | UX acceptance |
| Migration journal | October 4 closeout records exact catalog comparison, eight hash reconciliation and successful normal migrator | Fresh deployment migration/upgrade proof on deployment day; current mismatch is not still an open local gate | Deployment |
| Retention | Published outbox copies bounded to 500 deletions after 30 days; pending/domain/receipts protected, database tests recorded | Hosted worker schedule and observed backlog/error alerts; define receipt/activity product retention before deleting them | Operations |
| Auth and email providers | Seeded password sessions and browser collaboration are narrower than full hosted auth | Confirmation, Google callback/session/refresh, recovery and invitation email/webhook delivery on chosen hosted deployment | Deployment |
| Recovery, alerts and costs NF09/NF10/NF12 | Targets and procedures documented | Timed disposable restore, observed alerts, rollout/rollback proof, infrastructure costs and operating owner | Operations |
| Feature flags, guides and AI | Existing AI/CSV flags and deterministic guide modules | Current capability/role/flag inventory and flag ownership/review conditions; guide reconciliation; AI evaluation only after core acceptance | Core documentation, later AI |
| Integration | Previous local checkpoints d8de19b and 9d82996; latest changes still dirty | Review explicit files, separate reliability/pagination/UX commits, then authorized push; preserve unrelated drafts | Integration |

A 100-connection run is not a 100-user run. The older 200-connection one-user sample with overridden test limits is narrower still. No new production environment is required to complete the local functional work; fresh deployment remains deferred as requested.

## Stack use decisions

Keep Next/React/TypeScript, PostgreSQL/Supabase, Postgres.js and Drizzle schema/migrations, Redis/SSE, Radix/shadcn and Tailwind. Current SQL owns transactions, authorization, optimistic versions, command receipts and outbox atomicity. These application contracts remain our responsibility even when generic UI or data-lifecycle code is delegated to a library.

1. Inventory and measure before replacing: actual imports, installed versions, duplicate stores/hooks, missing server boundaries, form ownership, CI coverage, package licenses and bundle footprint. Manifest latest ranges deserve explicit upgrade policy; npm lockfiles already pin resolved installations, so this is reproducibility maintenance rather than proof of a broken build.
2. Add supported server-only DAL guards after adapting direct Node database tests. Keep page guards supplementary and Server Actions permission checked. Read-only SSR can be improved incrementally; do not turn the whole interactive dashboard into server components.
3. Run a Board-only TanStack Query pilot. Key data by actor, workspace and normalized filters; isolate aggregates from pages, invalidate through SSE, clear caches on account changes, preserve captured versions and drafts. Match existing cursor/stale-response/conflict/idempotency behavior. Adopt only if real lifecycle code disappears without worse requests, latency, bundle cost or accessibility. Keep the current hook if the pilot has no clear gain.
4. Reuse existing Radix/shadcn and Saathi tokens. Use existing React Hook Form/Zod for complex editing where it reduces duplicated validation and draft state; native simple quick-add remains appropriate. Copied component source still needs an upgrade owner and regression coverage.
5. Strengthen CI with disposable database migration/correctness checks and a small Playwright/axe core journey suite. Existing Node source assertions and fake React harnesses cover useful regressions but do not replace rendered browser behavior. Retain domain tests; add tools only where a real evidence gap exists.
6. Keep current Supabase verified auth while measuring profile resolution. Latest diagnostics show profile reads dominate auth lookup. Any getClaims/getUser split requires project signing and freshness semantics plus revoked/disabled/expired/unverified-user tests. Do not enlarge the DB pool or cache membership decisions blindly.
7. Use appropriately licensed Atlassian public tooling only for approved features. Pragmatic drag and drop is a candidate if dragging is required; retain status controls for keyboard/mobile and versioned server mutations. General ADS licensing is not a blanket grant for a competing standalone product.

Sources and adoption tradeoffs are recorded in [framework research](2026-10-05-stack-practices-research.md), including official Next, Supabase, TanStack, React, Radix, shadcn, Drizzle and Atlassian references.

## Recommended execution order

First consolidate the functional ledger and close Activity continuation plus terminology gaps. Next test one framework reuse slice, starting with the bounded Board query pilot; remove confirmed redundant code only after equivalent behavior passes. Establish repeatable browser/database CI. Then execute the full NFR workload and measured startup follow-up. Hosted auth/email, scheduling, backup/restore, alerts and deployment acceptance belong to the deployment-day checklist. Onboarding and AI help remain separately scoped after core closure.

Competing with Jira does not imply building every Jira capability or adopting its infrastructure. The current product targets smaller teams and simpler work; hierarchy, configurable workflows, automation rules, reporting and integration breadth require separate discovery if the intended market demands them. This review does not add them silently.
