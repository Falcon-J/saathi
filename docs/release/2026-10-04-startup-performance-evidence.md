# Connection startup performance

This follow-up addresses the 44-second startup tail measured during the core closeout. The changes preserve verified Supabase identity, confirmed email, membership checks, default connection limits and failure behavior.

## Measured causes and changes

Concurrent requests for the same verified user's profile independently queued SQL through the existing single-connection pool. A probe of 200 simultaneous calls issued 200 statements and took 17,533ms overall, with p95 16,650ms. Profile reads now share only an in-flight promise by user ID. Completed values are discarded. A successful username update invalidates an earlier read, and an older promise cannot evict a newer pending read. The same real database probe then issued one statement and completed in 89ms. Authentication still calls Supabase getUser and validates confirmation before profile lookup; this does not cache authenticated sessions.

Lease admission previously claimed an individual key, listed all active lease IDs and fetched each lease over REST. A 200-request admission probe used 40,602 Redis commands, with p95 23,823ms. Concurrent requests also temporarily counted one another before rejection: with five slots available, all 200 were rejected in the real Redis regression fixture.

Admission now uses one atomic Lua operation on a sorted set. Redis's clock determines expiration; expired members are removed before counting, the cap is checked before insertion, and retrying the same lease ID does not consume another slot. The key's lifetime follows the longest remaining lease, so a shorter lease does not expire longer connections. Release removes just the caller's lease ID. Configured Redis failures remain fail closed. This uses the installed SDK's [EVAL API](https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval) with one explicitly declared key and no dynamic key access.

The equivalent 200-admission probe used 401 commands including existing attempt rate limiting, with p95 78ms and total 82ms. The normal five-slot burst test admitted exactly five and rejected 195; its final run used 401 commands and admission p95 60ms. Real Redis tests also proved retry identity, expiry, mixed-duration key TTL, repeated release and invalid configuration rejection.

## Comparable HTTP result

| Measurement | Earlier closeout | After startup fixes |
| --- | --- | --- |
| Connections opened | 200/200 | 200/200 |
| Connection startup p95 | 44,120ms | 1,196ms |
| Benchmark events received | 600/600 | 600/600 |
| Delivery p95 | 570ms | 623ms |
| Transport failures | 0 | 0 |

Startup p95 improved by about 37 times, or 97%. Both runs used a separate production-mode Next server on port3004, the existing hosted test Auth/PostgreSQL and real local Redis through the REST transport fixture. They used one disposable authenticated user and process-local admission overrides of 250 connections and 300 attempts. No application defaults were raised. This establishes a comparable synthetic transport improvement, not 200 distinct users under normal quotas, provider SLA or production capacity. It is one before/after run rather than repeated statistical benchmarking.

## Verification

- Full registered suite: 220 passed, zero failed, two environment-dependent skips.
- Production build including TypeScript: passed after both source changes.
- Lint: passed.
- Real PostgreSQL profile burst: one query, 89ms for 200 calls.
- Real Redis default-cap, expiry and retry checks: passed.
- Independent review: no additional application defect; required the lease-format deployment gate below. Six focused profile and Redis recovery checks also passed in review.

No commits, pushes or deployments were performed. The disposable HTTP user and workspace were removed, the isolated server and REST bridge closed, and the dedicated Redis fixture was stopped after verification. Previously verified schema and domain mutation code were not changed in this follow-up.

## Required deployment gate

The new key format is `sse:connections:v2`; the previous format used `sse:leases` plus individual `sse:lease` keys. Their counts are independent. Do not deploy mixed versions while old connections remain live, as a user could obtain a full allowance in each format.

For the user's planned fresh deployment, provision the fresh Redis resource before starting the new version. For any future in-place upgrade, first stop routing new SSE requests to old instances, stop those instances, and drain their connections. Confirm that no old-format live lease keys remain; a crashed connection can leave a lease until its configured TTL expires. Do not delete live leases as a shortcut. Only then admit connections with the new version. A rolling old/new overlap is not supported by this migration. Deployment automation must enforce this gate before an in-place release.

## Next acceptance

Run distinct authenticated users with normal admission limits and provider quotas, preserving startup and delivery budgets. Board/activity pagination and hosted worker/recovery acceptance remain as described in the core closeout documents. The earlier 44-second startup gap is resolved in the tested synthetic scope; distributed production readiness is still a separate gate.

## Reproduction

With the dedicated loopback Redis fixture running, `npm run verify:sse:leases:local` executes the actual application admission path against real Redis and checks capacity, expiry, retry and TTL behavior. The comparison probes and authenticated HTTP fixture remain in ignored `.local-test` for operator inspection; credentials and cookies are generated in process and not printed or checked in.
