# Hosted recovery — 2026-10-23

## Verified cause and recovery

Vercel's public Supabase URL settings mapped production to `Saathi` (`uccncldirwhlyrhxwbwt`) and preview to `preview-saathi` (`vnaumgbgqbeqlbaibxdg`). Both projects reported `INACTIVE`.

The existing projects were resumed through Supabase. Both transitioned through startup states to `ACTIVE_HEALTHY`. A read-only `SELECT 1` succeeded against each database.

Public production checks after resumption:

| Endpoint | Result |
| --- | --- |
| `/api/health/live` | 200, `status: ok` |
| `/api/health/ready` | 200, `status: ready` |
| `/login` | 200 |

The readiness check tests PostgreSQL and Redis. Recovery from 503 to 200 after resumption identifies the inactive database as the observed readiness blocker. No application deployment or credential rotation was required.

Supabase's current [project-pausing documentation](https://supabase.com/docs/guides/platform/free-project-pausing) states that inactive Free projects can be automatically paused and resumed with their existing data/configuration. The specific cause of these projects' pause was not established. No plan or billing change was made.

## Approved production migration

Production's Supabase migration history contained the seven foundation migrations through `restrict_security_definer_functions`; `command_receipts` was absent. Preview already had all eight repository migrations recorded in its Drizzle journal.

The user explicitly approved applying the existing `drizzle/0007_command_receipts.sql` to production, without authorizing app merge or deployment. The exact existing SQL was applied through Supabase as migration `command_receipts`.

Post-migration catalog verification:

- Receipt rows: zero at verification.
- Foreign keys: two; primary key: one; command-type check constraint: one.
- Row-level security: enabled.
- `anon` and `authenticated`: SELECT, INSERT, UPDATE and DELETE privileges all false.
- Supabase migration history contains `command_receipts`.
- Public production readiness remains HTTP 200.

Existing business rows were not edited. Production uses Supabase migration history; preview has a Drizzle journal. Do not blindly run the Drizzle migration runner against production without reconciling that history and schema first.

## Remaining release boundaries

- Commit `dacc1e9` passed [CI run 39926786809](https://github.com/Falcon-J/saathi/actions/runs/39926786809). Its Saathi preview deployment was verified READY at the same SHA.
- Vercel protected-preview access and runtime logs still return 403. Database access through Supabase resolved the readiness investigation; Vercel access itself was not repaired.
- Preview has no Groq key in the inspected environment metadata. Hosted AI/authenticated collaboration, email/webhooks, worker schedules/alerts and managed recovery/rollback remain unverified.
- Local performance acceptance remains failed; see `2026-10-21-completion-execution.md` and the recorded benchmark results. Readiness 200 does not establish performance acceptance.
- No app merge, production deployment, paid-plan upgrade or change to authorization controls occurred.
