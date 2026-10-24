# Core audit fixes: evidence and operating limits

User authorized implementation with FIX after the six ranked core findings. Changes remain uncommitted and undeployed in the existing feature checkout. Earlier unrelated working-tree changes were preserved.

## Delivered behavior

1. Committed task, comment and workspace writes keep their success when cache refresh fails. Unexpected task/comment write failures report an uncertain outcome. Cache refresh and outbox publication are isolated in `lib/post-commit.ts`; publication uses Next `after` and the existing durable outbox worker. The existing AI draft confirmation caller also schedules delivery.
2. Task and comment creates accept optional UUID command identifiers. `command_receipts` stores request hashes and committed response snapshots in the same transaction as the entity and activity/outbox event. The workspace lock serializes retries; current membership and archive checks precede receipt access. Reused identifiers with changed input are rejected. RLS is enabled and browser roles receive no privileges. Task receipts survive task deletion so a late retry cannot recreate the task.
3. Task creation preserves uncertain command IDs by account, workspace and input during the hook lifetime, including A-to-B-to-A navigation. Comments reuse their command during draft reconciliation. CSV commands are stable for the same account, workspace, exact file content and row index; identical rows within a file remain separate. A changed file is a new import. Successful import followed by failed Board refresh reports saved tasks and a refresh warning.
4. Initial task loads, explicit refreshes and realtime refreshes share a read generation. State updates invalidate older reads. Realtime bursts share an in-flight task read and retain a trailing refresh. Task events do not reload workspace lists; workspace events/reconnects still perform full reconciliation. Workspace create/remove and refresh outcomes are scoped to captured account/selection.
5. Workspace lists use one workspace projection and one member projection rather than 1 + 2N statements. Empty lists return after the first query. Membership filtering, archived filtering, deterministic order and member roles remain intact.
6. SSE polls Redis every 500 ms instead of 100 ms. Membership is rechecked every five seconds while idle, before each event batch, and before heartbeat data. The idle revocation interval excludes database/network latency. No cached membership decision authorizes event delivery. Single-flight polling, cursors, replay checks and connection cleanup remain intact.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 205 passed, 1 skipped, 0 failed; the skipped database-dependent AI check passed separately |
| Current database regression files | 38 passed, 0 skipped/failures in their final runs: schema 9, workspaces 12, collaboration 8, create retries 1, comments 4, usage 1, AI operations 3 |
| `npm run type-check` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `npm run db:check` | Passed; metadata consistency does not repair the current database's empty baseline journal |
| Browser smoke | Existing authenticated in-app session reloads; Overview opens Board/editor; comment read completes; no writes made |
| Independent code review | Found uncertain create ID loss across navigation and missing AI confirmation delivery caller; both reproduced with failing regressions and fixed; no second review claimed |

Observed red-to-green regressions include cache invalidation after commit, concurrent duplicate creates, changed-input retry rejection, stale task refresh overwrite, stable CSV row commands, workspace query count, idle SSE authorization costs, import refresh failure, navigation retry identity and the missed delivery caller. Controlled runtime tests exercise real modules/hooks/components with external dependencies replaced; they are not DOM or hosted-provider proof.

The workspace SQL instrument initially counted postgres's value-list helper as an extra query; it now counts tagged SQL statements only. The comments database suite exposed a fixture ordering problem: an archived workspace was used for a member-removal test. The removal scenario now owns an active fixture, while archived membership changes remain explicitly rejected.

## Database migration state

The current database was explicitly authorized by the user as disposable test infrastructure. Existing tables were present while `drizzle.__drizzle_migrations` had zero entries. The normal migrator attempted to recreate existing tables and failed. Only `drizzle/0007_command_receipts.sql` was applied directly and transactionally to this database. Existing migration history was not fabricated, reset or backfilled. Fresh deployment must apply the complete repository migrations to a fresh database and verify the journal before enabling writes.

## Remaining operating limits

- Real Redis recovery, provider outages under load, and throughput/latency benchmarks were not executed. Development Redis is mocked. One transient SSE connection error was captured during development reload; the dashboard subsequently displayed Live. No hosted reliability claim follows from this smoke check.
- Post-response delivery handles up to four 25-event batches per workspace callback. Remaining or failed rows require the existing authenticated outbox worker. Scheduling, credentials and alerts for that worker are a deployment-day gate.
- Durable receipt replay requires the caller to retain its command ID. Task/comment browser command state is retained during the current hook/composer lifetime, not across a full browser reload. After a reload or closing a composer, reconcile persisted records before entering a new create. Exact-file CSV retry IDs remain stable across reloads.
- The task and comment lists still retrieve full history. Pagination, retention policy for receipt snapshots and representative size benchmarks remain NFR work; no silent truncation was introduced.
- No new AI functionality, framework migration, commits, pushes or deployments were performed.
