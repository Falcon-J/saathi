# Local performance follow-up: October 24, 2026

## Current verdict

Performance acceptance remains **failed**. The two additional diagnostics below preserve the unchanged read p95 target of **750 ms**, delivery upper-bound p95 target of **2,000 ms**, and unexpected failure rate below **1%**. Neither run establishes sustained capacity. No further 900-second run was started.

Both used real loopback Supabase Auth/PostgreSQL and Redis through the existing local REST test bridge: 100 authenticated identities, four workspaces with 25 members each, 750 seeded tasks per workspace, and 100 writes scheduled over 60 seconds. Reads remain response-dependent with a 15-second think time. Pool five was an isolated process setting; the application default remains one.

## Implementation and command cost

- Presence previously issued `SMEMBERS` followed by one sequential `GET` per member for every recipient's heartbeat. The responsible Redis adapter now uses the installed SDK's native `MGET`. At 25 members, the real adapter/SDK/Redis probe verified **two read commands instead of 26**. The same five-minute timestamp condition, stale-member removal, deserialization, retry and strict mock policy remain in place.
- Profile diagnostics are gated by the existing `SSE_PERFORMANCE_DIAGNOSTICS=1`. They measure native connection reservation separately from client query elapsed time and release the reservation in `finally`, including query failure. The record contains durations and success only. The normal path does not reserve a connection, and no user identifier or SQL parameter is logged.
- Polling, idle membership checks, fresh authorization before event delivery, rate limits and performance thresholds are unchanged. Heartbeats do not call live Auth: they perform SQL membership and Redis presence work. There was no demonstrated Auth recheck stampede to justify changing authorization timing.

## Recorded diagnostics

| Run | Change/scope | Read p95 | Write p95 | Delivery upper-bound p95 | Workload elapsed | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `ef216ba2-d467-4958-a62c-1d041f91f821` | Presence batching, 60-second diagnostic | 5,348 ms | 9,792 ms | 8,169 ms | 67,769 ms | Both latency targets and 61-second workload tolerance failed |
| `29f240a8-c85f-4b1f-9f39-63eb5afcc8fe` | Same bounded presence path plus gated profile timing and separate resource sampling | 2,269 ms | 4,708 ms | 2,396 ms | 60,219 ms | Both latency targets failed; functional diagnostic execution passed |

Each run persisted all 100 writes and observed all 2,500 expected recipient deliveries, with zero request errors, missing deliveries or duplicates. Owned SQL rows, Auth identities, exact Redis keys and the owned server were cleaned. Delivery timing runs from the transaction-assigned event timestamp to observer receipt; it is a conservative upper bound rather than an exact commit timestamp.

Sanitized evidence:

- [Presence diagnostic](benchmarks/2026-10-24-local-nfr-presence-batch-diagnostic.json)
- [Profile queue diagnostic](benchmarks/2026-10-24-local-nfr-profile-queue-diagnostic.json)

The source/build fingerprints are preserved. Diagnostic `passed` means functional execution, not performance acceptance; diagnostic latency assertions are disabled, while its workload envelope remains enforced. Both artifacts explicitly retain failed performance targets. No comparison demonstrates that batching improved latency; the command reduction is established independently.

## What the targeted split established

In `29f240a8`, 300 profile measurements recorded reservation p95 **under 1 ms** (maximum 114 ms) and client query elapsed p95 **73 ms** (maximum 207 ms). Aggregate live Auth p95 was **2,028 ms**. Profile pool queueing does not explain this run's latency tail. Query elapsed includes client scheduling and network time; it is not PostgreSQL engine execution time alone. Aggregate phase percentiles do not identify the phases of an individual request and cannot be added or subtracted.

Separate read-only sampling covered the measured workload. The 212 PostgreSQL snapshots mostly observed `ClientRead`; they also captured nine `WalSync`, seven transaction-ID lock and one tuple-lock connection observations. Counts are observations, not elapsed wait durations. Maximum tagged application connections reached ten despite pool five. Loading two copies of the current production module in one JavaScript runtime also created two pools using the same synthetic configuration. The live sampling did not record Node PID ownership, so a process-wide pool change remains a proposal requiring its own correctness review, not an established latency repair.

Eleven Docker samples per container during the workload recorded rounded CPU usage, where 100% represents one CPU:

| Local container | Median CPU | Maximum CPU |
| --- | --- | --- |
| Auth | 106% | 173% |
| PostgreSQL | 294% | 530% |
| Gateway | 14% | 66% |
| Redis | 6% | 8% |

The inspected containers had no individual CPU/memory cap; Docker exposed eight CPUs and approximately 16.6 GB shared with other projects. These samples show resource use during the run, not proof of which service caused each request's delay.

Ten serial dependency pairs before/after the run remained fast: live Auth p95 **174/69 ms**, `SELECT 1` **7/2 ms**, profile reads **11/3 ms**. Each used one disposable identity with exact profile/Auth cleanup. This establishes a healthy serial dependency baseline, not application SLO acceptance.

## Validation and replay

- `npm test`: **376 tests, 374 passed, zero failures, two optional skips**.
- `npm run type-check -- --incremental false`: passed.
- Focused Redis/realtime/membership checks: **36 passed**; profile checks: **four passed**. New command-count and profile diagnostic regressions failed before the respective changes.
- Scoped ESLint and the matching local production webpack build passed. The build used the existing local configuration helper; no hosted environment was changed.
- Real Redis probe: `node --experimental-strip-types .local-test/completion-20261021/presence-batch-probe.mjs`; synthetic keys cleaned after the two-command assertion.

Raw timing JSONL, resource samples and logs remain ignored. Each recorded replay was generated offline using:

```powershell
npm run report:nfr:local -- .local-test/nfr-ef216ba2-d467-4958-a62c-1d041f91f821
npm run report:nfr:local -- .local-test/nfr-29f240a8-c85f-4b1f-9f39-63eb5afcc8fe
```

Both produce a local `report.html` retaining the failed gates. No new hosted, sustained-capacity, backup/restore or rollback claim follows from this slice. The next performance action needs a reviewed bottleneck hypothesis and a controlled environment, rather than another unchanged long run or weaker authorization.
