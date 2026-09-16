# Saathi v1 release evidence — 2026-09-16

## Scope

This record captures the code, disposable PostgreSQL, hosted deployment, and authenticated browser evidence collected during the core FR/NFR validation phase. It does not claim full production readiness; the external/manual gates below remain open.

## Verified evidence

| Area | Result | Evidence |
| --- | --- | --- |
| Source regression suite | PASS | `npm test`: 146 passed, 1 skipped, 0 failed |
| PostgreSQL schema and domain suite | PASS | `npm run test:database`: 25 passed, 0 failed against the disposable local PostgreSQL service |
| Type contracts | PASS | `npm run type-check` |
| Static quality | PASS | `npm run lint` |
| Production build | PASS | `npm run build` and environment-shape validation |
| Main branch | PASS | Merge commit `f557e03` pushed to `origin/main` |
| Vercel production deployment | PASS | Main commit `f557e03` deployed and reached `READY` |
| Liveness | PASS | `https://saathi-ten.vercel.app/api/health/live` returned HTTP 200 and `{"status":"ok"}` |
| Current hosted runtime errors | PASS for observed window | No runtime errors found in the post-deploy 30-minute window |
| Authenticated workspace shell | PASS | Browser reload reached the authenticated workspace and loaded Overview, Board, Team, and Settings |
| Task comments | PASS | Hosted task detail now loads the empty comment state without the previous error |
| Activity and history | PASS | Hosted Overview expanded Activity and history and rendered server-recorded events |

## Correctness fix delivered

`listTaskComments` now authorizes inside a read-only transaction without `FOR UPDATE`. Comment creation retains the row lock. The focused database test covers comment creation, listing, membership enforcement, and the durable activity event, and is now part of `npm run test:database`.

## Open gates

1. Two-user collaboration still requires two real disposable accounts for invite, accept, assignment, comment, completion, reconnect, and negative authorization checks.
2. Resend has no verified sending domain, so real invitation delivery and webhook outcomes remain blocked. No external email was sent by this validation run.
3. Live AI execution remains unverified. The production UI exposes the bounded advisor, but no provider call was made during this run.
4. Supabase hosted Auth templates remain on the default provider templates until custom SMTP is configured. Repository templates are present, but hosted template delivery is not yet evidence.
5. Backup, restore, retention, alerting, and readiness-failure drills remain operational release gates.

## UX follow-up kept separate from FR/NFR correctness

The authenticated test workspace contains valid 2026 deadlines on 13–15 September while the validation date is 16 September. The current Overview intentionally surfaces past open deadlines in the Today attention bucket, but the summary card says `Due today` and the section does not visibly distinguish overdue work. This is a UX/semantic presentation issue for the next refinement phase; the persisted dates and workspace-timezone date calculation are working as observed.

## Release decision

Core code, schema behavior, deployment health, comment reads, and activity rendering are locally and manually evidenced. Do not label the beta fully production-ready until the open collaboration, email, AI, and operational gates have owners and evidence.
