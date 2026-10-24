# Saathi v1 release evidence — 2026-09-22

## Decision boundary

This record separates repository evidence, hosted configuration evidence, deployed-runtime evidence, and external/manual gates. A green HTTP health check is not proof that collaboration, email, realtime, backups, or recovery have been fully validated.

## Source and local validation

| Area | Result | Evidence |
| --- | --- | --- |
| Active checkout | PASS | `C:\Users\1552441\Documents\ChatGPT\saathi.git\implementation` |
| Verified local source | PASS | `HEAD 1341b4b36b616f79daaf98339fe120b9e3249749` |
| Hosted source baseline | PASS | `origin/main 6bab6a3ec0bdb7f34475fa9f58ea8742a4990011` |
| Database preflight | PASS | `npm run test:database`: 26 passed against disposable loopback PostgreSQL |
| Regression suite | PASS | `npm test`: 150 tests, 149 passed, 1 intentional skip, 0 failed |
| Type contracts | PASS | `npm run type-check` |
| Static quality | PASS | `npm run lint` |
| Production build | PASS | `npm run build` |
| Migration configuration | PASS | `npm run db:check` |
| Environment-shape validation | PASS | `npm run validate-env` |
| Diff whitespace | PASS | `git diff --check` |

The database test command now fails closed when `DATABASE_TEST_URL` is missing or points away from loopback. This protects the integration suite from silently becoming a non-test.

## Hosted configuration and deployment

| Area | Result | Evidence |
| --- | --- | --- |
| Supabase project health | PASS | Hosted project reported Healthy in `ap-southeast-1` |
| Supabase Auth Site URL | PASS | `https://saathi-ten.vercel.app` |
| Supabase Auth callback | PASS | Production callback is configured; local callback retained for development |
| Vercel Production secrets | PASS | `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `GROQ_API_KEY` are stored as Secret variables; values intentionally not recorded |
| Production redeploy | PASS | Vercel deployment `EZhWUmuCV3Eq2c4fUwFaeDKmniL1` reached Ready |
| Deployed source | PASS | Redeploy uses `main` at `6bab6a3`; this was a settings-only redeploy |
| Live liveness | PASS | `https://saathi-ten.vercel.app/api/health/live` returned HTTP 200 |
| Live readiness | PASS | `https://saathi-ten.vercel.app/api/health/ready` returned HTTP 200 |
| Public login route | PASS | `https://saathi-ten.vercel.app/login` returned HTTP 200 |
| Production worker auth boundary | PASS | Unauthenticated `POST /api/internal/outbox` returned HTTP 401 |
| Production benchmark safety boundary | PASS | `POST /api/realtime/load-test` returned HTTP 404 in Production |
| Hosted benchmark publisher policy | PASS (code) / OPEN (environment) | Publisher is enabled only in development, staging, or `VERCEL_ENV=preview` with a secret; production remains disabled. The current Preview deployment still needs a separate beta topology and controlled access. |

## Open external gates

These require provider access, disposable accounts, or a controlled manual drill and are not claimed as complete:

1. Two-user authorization and collaboration matrix: invitation, acceptance, assignment, comments, completion, reconnect, conflict, and non-member denial across workspace reads, tasks, comments, realtime, and AI.
2. Resend sending-domain/DNS verification, controlled invitation delivery, bounce/complaint handling, webhook verification, and provider-safe logging.
3. Hosted Supabase custom SMTP confirmation and recovery delivery.
4. Authenticated SSE benchmark, reconnect reconciliation, outbox failure/retry, and retention evidence.
5. Backup/restore, retention, readiness-failure, alerting, and rollback drills. The current Supabase Free Plan does not provide scheduled project backups.
6. Accessibility, keyboard navigation, 390px mobile, loading, offline, permission, conflict, and error-state review.
7. A protected, separately configured Preview beta is required before running the authenticated SSE benchmark; do not point the benchmark at Production.

## Release classification

**Current status: release candidate — external gates open.**

The code and hosted deployment have strong local and basic runtime evidence. Do not describe the system as fully production-ready until the open gates above are either passed or explicitly accepted by an accountable owner with a deadline.
