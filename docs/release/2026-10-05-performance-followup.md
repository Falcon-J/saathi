# SSE authorization performance follow-up

Date: 2026-10-05. Local working tree; no commit, push or deployment.

## Root cause and controlled evidence

The database client permits one concurrent connection. The previous authorization verifier coalesced checks for the same actor only. Twenty distinct actor checks queued twenty separate network round trips. Each subscribed stream repeats fresh authorization before delivery.

A controlled direct hosted test database probe used twenty concurrent nonexistent actor IDs in one nonexistent workspace, unchanged `max: 1`/`prepare: false` settings, and identical membership SELECT predicates. It printed timings and counts only. PostgreSQL client debug callbacks measured query dispatch after an initial `SELECT 1` excluded connection startup.

| Probe | Requests | SQL statements | Total | Queue p95 | Query p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous per-actor reads | 20 | 20 | 1774 ms | 1594 ms | 92 ms |
| Fresh batched workspace reads | 20 | 1 | 117 ms | 26 ms window plus queue | 90 ms single query |

The SQL round trip remained approximately 90 ms while collapsing the queue reduced completion time by 93.4% in this diagnostic sample. These are probe timings, not HTTP or durable commit-to-observer acceptance results.

The first 10 ms batching implementation did not resolve the actual workload: staggered stream timers continued creating tiny SQL batches and queued them behind one connection. That intermediate run delivered 500/500 events but observed startup p95 6810 ms and delivery p95 2666 ms. Phase instrumentation showed membership read p95 2831 ms against Redis polling p95 10 ms. The final refinement holds newly queued checks while a workspace query is active, accumulating them into the next fresh query. It never adds actors to an already dispatched query or reuses a completed decision.

## Final change and authorization contract

A 10 ms scheduling window groups queued checks by workspace and requests the actor IDs with one `ANY(...::uuid[])` query. At most one membership query for each workspace is dispatched at a time; checks arriving during that read accumulate for its successor. Each actor receives only its own membership result. Same-actor concurrent requests share an in-flight promise. Completed decisions are removed, including failures; the next delivery check performs a fresh database read. Event batch checks, idle revocation checks and heartbeat checks remain in place. The pool, normal admission caps and Supabase verified-session logic are unchanged.

Operator-only `SSE_PERFORMANCE_DIAGNOSTICS=1` records phase names and elapsed milliseconds for verified Auth lookup, profile resolution, their combined route duration, membership reads, authorization including batching/queueing, and Redis polling. It emits no cookies, actor/workspace identifiers or credentials. The option is off by default; it is a local diagnosis switch, not a public telemetry feature.

## Final production HTTP sample

The final fixture used twenty distinct disposable hosted test Auth users, one disposable workspace, 100 concurrent production-mode localhost connections and real disposable local Redis through the loopback REST adapter. Normal limits remained five connections and thirty attempts per minute per user. The preview-only synthetic publisher used an ephemeral process secret.

| Check | Final result |
| --- | ---: |
| Independently authenticated users | 20 |
| Admitted connections | 100 |
| Sixth connection rejected | 20/20 HTTP 429 |
| Release and reconnect | 20/20 HTTP 200 |
| Published synthetic events | 5 |
| Expected/observed deliveries | 500/500 |
| Transport exceptions | 0 |
| Startup p95 | 3245 ms |
| Reconnect p95 | 3388 ms |
| Aggregate synthetic delivery p95 | 1007 ms |

The previously documented same-scope baseline observed startup p95 5461 ms, reconnect p95 3893 ms and synthetic delivery p95 2739 ms. Final delivery p95 was 63.2% lower and below the two-second target in this short sample. The earlier baseline and final run are separate trials rather than a statistically controlled comparison. A separate disposable Board test fixture briefly wrote to the shared hosted database during the final run, so startup timing in particular is not an isolated capacity measurement.

Final phase percentiles combine startup, steady delivery and reconnect activity; they do not add into one request's total:

| Phase | Samples | p50 | p95 |
| --- | ---: | ---: | ---: |
| Verified Auth getUser | 140 | 138 ms | 255 ms |
| Profile resolution | 140 | 1264 ms | 2229 ms |
| Combined Auth/profile route phase | 140 | 1410 ms | 2389 ms |
| Membership SQL read including DB queue | 56 | 121 ms | 2276 ms |
| Authorization including scheduling/workspace queue | 1018 | 207 ms | 1600 ms |
| Redis polling | 3422 | 6 ms | 47 ms |

Profile resolution remains a startup cost; no profile, Auth validation or pool change was made. No approved startup percentile budget was identified. A full performance acceptance run is still required: this fixture does not measure durable domain commit timing or satisfy the formal fifteen-minute/at-least-1000-measured-event workload. The outage phase interrupts the REST adapter briefly and demonstrates resumed delivery after availability returns; it does not prove lost-event replay, provider failover or disaster recovery.

## Validation and cleanup

New batching tests failed first because the verifier was absent; the accumulation regression also failed before its refinement. Seven focused authorization/route tests passed after refinement. Coverage includes actor isolation, same-actor coalescing, revocation after completed reads, workspace isolation, failure retry, new actors after dispatch, accumulated successor batches and preventing delivery after revocation. Scoped ESLint and TypeScript passed. The production build succeeded before the final load. Final elevated full suite: 246 tests, 244 passed, two existing integration skips, zero failures. Parent changes to client pagination after that build require its final integrated build; the measured SSE implementation was unchanged.

All twenty generated fixture users/profiles and the workspace were removed after each completed load attempt. Streams, isolated server and REST bridge were closed. `docker stop saathi-core-redis-test` succeeded after the final run. Existing workspaces/tasks were untouched by this performance fixture. Ignored operator scripts and logs remain under `.local-test/`; raw server logs must not be staged.

An attempted extra baseline authenticated twenty disposable users but child-process creation was denied in the sandbox; those fixtures were removed. Later build/load/test commands ran with authorized child-process access. No provider quota or hosted capacity claim is made from these samples.
