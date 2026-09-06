# Saathi implementation checkpoint — 2026-09-06

## Working location and scope

All new implementation is in `C:/Users/1552441/Documents/ChatGPT/saathi.git/implementation`, an isolated detached worktree based on `1bff1e3`. The original checkout at `C:/Users/1552441/Downloads/saathiproject/saathi` was not edited. Its pre-existing source/document changes were copied into this worktree; secret files were excluded. Nothing staged, committed, pushed, or deployed.

User priorities: preserve the existing Saathi logo; core collaboration first; optional AI goal-to-reviewed-plan only; conserve usage. Do not dispatch further broad agents or repeat the initial audit.

## Implemented locally

- Supabase Auth adapters: verified identity, signup confirmation, login/logout, PKCE callback, password recovery, cookie-refresh proxy; PostgreSQL profile projection.
- PostgreSQL schema/migrations: workspace owner membership constraint, member uniqueness, task-assignee membership constraint, pending invitation uniqueness, activity and outbox records.
- Transactional workspace/settings, task, membership, invitation actions; old UI email/status representations are derived projections, not duplicate database authority.
- Optional AI draft suggestion + explicit reviewed-plan creation in one database transaction. Previous direct AI mutation entry points fail closed.
- Overview / Board / Team / owner Settings; explicit loading/error/empty states; invitation response and pending invitations UI. Existing logo retained.
- Realtime authorization uses PostgreSQL membership; clients reconcile authoritative projections. Durable outbox delivery preserves committed state on publication failure.
- Resend email request queue with immutable payload, provider idempotency key, bounded retries, manual-review cutoff before the provider idempotency window expires. `sent` means provider acceptance, not inbox delivery.
- Authenticated POST `/api/internal/outbox` attempts bounded realtime and email queue batches. Configure a scheduler separately; no scheduler was installed remotely.

## Important implementation choices

Use existing Next.js application boundaries and `postgres` transactions with parameterized SQL; Drizzle maintains schema/migration metadata. No new AI framework. Runtime/database credentials remain server-side. No automatic Redis data deletion or production reset.

The worker currently uses an explicit server-held `CRON_SECRET` bearer credential rather than adding QStash. Scheduler deployment and monitoring remain release gates. Email links identify an invitation; they never authorize acceptance without the verified invited identity.

## Local database testing

Disposable PostgreSQL container: `saathi-implementation-db-v1`, localhost port 55439. It has a minimal `auth.users` SQL fixture and roles, not a running Supabase Auth service. `scripts/bootstrap-test-database.mjs` refuses non-local targets. `scripts/migrate-database.mjs` applies the Drizzle journal using `DATABASE_MIGRATION_URL`.

Use `DATABASE_TEST_URL` for `npm run test:database`. Do not point tests at hosted or production data: tests create and remove their own fixtures. Schema tests use rollback, workspace/collaboration tests clean only their generated UUIDs.

## Remaining work before claiming a complete release

1. Complete least-privilege runtime database role provisioning and verify RLS/Data API denial in actual Supabase. `DATABASE_URL` must use a dedicated server-only runtime role; migration identity stays separate.
2. Configure a Supabase preview project, callback allowlist, verified-email policy and recovery email.
3. Configure email sender/domain, provider key, scheduler, and provider delivery/bounce handling. Real emails have not been sent.
4. Browser desktop/mobile + two-user tests: signup/confirmation/recovery, workspace/task CRUD, invitations, member removal, logout, reconnect, and persisted refresh. No authenticated browser evidence exists for this implementation yet.
5. Run authenticated load tests after adapting the old custom-cookie harness to Supabase cookies; do not claim concurrency/latency figures.
6. Verify optional Groq suggestions or leave AI disabled. No real AI provider call was made.
7. Before deployment, obtain explicit deployment/test-data authorization, record rollback release and migration plan. Do not reset existing production users/data by assumption.

This is an in-progress local implementation, not a production-ready claim.

## Final checks at checkpoint

- `npm test`: 115 passed, 0 failed.
- `npm run type-check -- --incremental false`: passed.
- `npm run lint`: passed after fixing the invitation render and workspace selection ref.
- `npm run build`: passed with network/process access needed for existing Google Fonts. Importing server modules no longer terminates a build for missing runtime secrets; actual Redis operations remain unavailable rather than using mock storage in production.
- Final production build rerun after environment validation updates: passed.
- `npm run db:check`: passed.
- README, `.env.example`, and reliability notes now describe PostgreSQL as durable authority, Redis as ephemeral collaboration state, and the Resend scheduler/webhook configuration.
- Local public-route smoke test: `/`, `/login`, `/guide`, and `/api/health/live` returned `200`; `/api/health/ready` returned the expected `503` while PostgreSQL/Redis were unavailable.
- Removed confirmed unused `next-auth` and `nodemailer` direct dependencies; Nodemailer remains only as an optional peer of `@auth/core` in the lockfile.
- `git diff --check`: passed (only line-ending/EOF warnings from existing Windows normalization).
- Logo component and public assets: no implementation diff.
- Earlier database runs: agent reported 19 schema/workspace tests passed; root executed 5 collaboration tests successfully (including the parent test). These used PostgreSQL plus SQL identity fixtures and mock realtime, not live Supabase.
- Final full `test:database` rerun: passed against a fresh disposable local Supabase/Postgres stack (24 tests across schema, workspace, and collaboration suites). The SQL identity fixture and local Auth stack are test-only; this does not validate a hosted Supabase project.
- Authenticated local browser journey: two disposable users signed up, were confirmed through local Auth, owner created a workspace and task, owner invited member, member accepted, owner assigned the task, member completed it, owner observed the completed state, and owner reloaded after a reconnect. Desktop and 390x844 mobile snapshots rendered without new console errors; the first unassigned-member completion attempt correctly returned access denied.
- No hosted deployment, real-email provider, real-Groq, backup-restore, or authenticated load-test validation was completed.

Resume with the release gates above, not a new repository audit. Local database and two-user browser verification are complete; the next step is configuring a preview Supabase/Redis/email environment and repeating the same journey against the hosted release candidate. Additional feature work is not needed at this checkpoint.
