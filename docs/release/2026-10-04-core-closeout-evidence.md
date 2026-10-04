# Core closeout evidence, October 4

The later startup follow-up supersedes the connection startup gap below in the comparable synthetic scope: see [startup performance evidence](2026-10-04-startup-performance-evidence.md). Earlier measurements are retained as historical evidence.

## Delivered and verified

- Empty hosted test database migration journal reconciled to all 8 exact SQL hashes and journal timestamps. A fresh local PostgreSQL reference matched columns/defaults, constraints, indexes, RLS/policies, browser table/column privileges, triggers and security definer function definitions/grants before any journal inserts. The normal Drizzle migrator then succeeded without replaying existing DDL. No application records were reset. Local drift tests rejected RLS and function privilege changes before journal insertion.
- Redis configured-client recovery fixed: exhausted retries no longer prevent later real operations or probes. Configured failures still cannot fall back to mock storage. Two regression tests pass.
- Concurrent SSE membership checks share only an in-flight database read for the same actor and workspace. Completed decisions are immediately discarded. Periodic checks and checks before event delivery remain in place. Actor isolation, workspace isolation, revocation and retry tests pass.
- Fresh subscriptions to empty streams now receive the first event. Their initial zero cursor is no longer mistaken for an expired reconnect cursor. Existing reconnect retention-gap handling remains in place.
- Comment history uses bounded keyset pages and Load older comments. A 137-comment fixture with tied microsecond timestamps traversed three complete pages without omissions, cross-task cursors were rejected and membership removal blocked the next page.
- Authenticated worker cleanup deletes at most 500 published outbox copies older than 30 days per run. Pending delivery obligations, command receipts and domain history remain retained. Database retention checks pass. Hosted scheduling has not been configured in this work.

## Execution results

| Check | Result | Boundary |
| --- | --- | --- |
| Full registered npm suite | 215 passed,0 failed,2 skipped | The AI database suite and optional journal integration require explicit database configuration; both were also run separately with it. |
| Database integration | 41 passing checks across 8 files | Initial complete run passed 40; expanded comments coverage then passed 6 rather than 5. The other 7 files were unchanged. Existing disposable hosted database used. |
| Journal reconciliation tests | 3 passed with local integration enabled | Exact baseline, RLS drift, PUBLIC function privilege drift and populated-journal refusal. |
| TypeScript, lint, production build |Passed | Production build rerun after final SSE source change. |
| Independent code review |No actionable application defect | Review caught two stale unregistered comment action assertions; corrected and added to npm test. Final SSE review passed its 3 focused tests. |
| Real Redis adapter fanout | 200 readers, 3 events,600/600 delivered, p95 340ms | Real Docker Redis7 behind a local REST transport fixture; not provider SLA or HTTP capacity. Outage and recovery verified. |
| Authenticated local HTTP SSE | 200 opened, 3 events,600/600 delivered,0 failures; delivery p95 570ms | Production Next server on port3004, hosted test Auth/PostgreSQL, local real Redis. One disposable user; test-process-only connection admission raised to 250 and attempt limit 300. Application defaults unchanged. |
| HTTP connection establishment |p95 44,120ms | Open performance gap. This burst is not acceptable evidence for a fast startup NFR. |

The first HTTP attempt with40 disposable users hit Supabase 429 `over_request_rate_limit` during password sign-in. It did not establish normal-quota multi-user capacity. The subsequent one-user transport run avoided repeated sign-ins, used a separate local process and explicit admission overrides. An earlier run opened 200 connections but delivered 0/600 in the measurement window; it exposed repeated membership reads and empty-stream first-event loss, leading to the tested fixes above. The final rerun delivered all 600.

Test user credentials, session cookies and fixture transport tokens stayed within the execution environment. Generated users and workspace were removed after each run; the isolated server and REST transport closed. Local PostgreSQL reference databases remain available for inspection. No commits, pushes or deployments were performed.

## Remaining requirements and operations

Task Board server pagination and complete activity continuation have a concrete contract and acceptance plan in the pagination document. They are planned, not implemented. Shared task collections still preserve complete Board search and Overview totals. Comment paging does not establish a bounded task collection.

Before a hosted capacity claim, run a distributed benchmark with distinct authenticated users under normal quotas and real provider configuration. Set explicit connection startup and event-delivery percentile budgets, test reconnect/replay and member removal during load, and measure database statement latency, pool wait and connection distribution. Investigate the 44-second startup tail before accepting the startup NFR; this closeout does not solve it. Avoid merely raising production admission limits.

Hosted retention requires a worker schedule and alerts; the implemented cleanup function alone is not an operational retention guarantee. Hosted restore testing, production configuration and deployment acceptance remain on the separate deployment-day track.

## Reproduction

Start the dedicated loopback Redis fixture, then run `npm run verify:redis:local`. The script exercises the actual application adapter against Redis through `scripts/local-redis-rest.mjs`; it does not connect to or emulate hosted Upstash. The bridge follows the installed SDK's JSON and response-encoding transport conventions described in the [Upstash REST API documentation](https://upstash.com/docs/redis/features/restapi), while executing commands in real Redis.

The controlled HTTP fixture lives in ignored `.local-test/http-load-closeout.mjs` for local inspection. The existing supported `scripts/load-test.ts` remains the reusable authenticated benchmark entry point for a configured session. Never put its cookies or secrets in a checked-in file or command history.

See `docs/migration-journal-reconciliation.md` for failclosed journal operations, `docs/architecture/2026-10-04-pagination-retention.md` for paging/retention contracts, and `docs/release/2026-10-04-commit-push-plan.md` for explicit staging and push order.

## Approval boundary

Automatic approval review rejected downloading the entire preview environment because it could copy credentials beyond the verification scope. That action was not retried or bypassed. The user selected local real Redis verification, which was completed without retrieving hosted Redis secrets.
