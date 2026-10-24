# Distinct authenticated user verification

Date: 2026-10-05. Source checkpoint: d8de19b. Documentation checkpoint before this run: 9d82996.

## Scope and controls
20 disposable users authenticated independently through the existing hosted test Supabase Auth. All belonged to one disposable workspace in the existing test database. A separate production-mode Next server ran on localhost:3004 with real local Redis through the existing loopback REST fixture. Normal application limits were used: five active connections per user and 30 attempts per minute. No admission, attempt-window or lease-duration overrides were applied. The synthetic publisher was enabled only for this isolated preview-mode process with an ephemeral secret. Cookies and passwords stayed in process.

## Observed results
| Check | Result |
| --- | --- |
| Distinct authenticated users | 20; no sign-in failures |
| Concurrent admitted connections | 100; five per user |
| Sixth connection for each user | 20/20 HTTP 429 |
| Release one connection per user and reconnect | 20/20 HTTP 200 |
| Initial three published events | 300/300 deliveries |
| Event after reconnect | 100/100 deliveries |
| Event after three-second REST Redis outage | 100/100 deliveries |
| Aggregate delivery | 500/500; no transport exceptions |
| Startup p95 | 5461 ms |
| Reconnect p95 | 3893 ms |
| Aggregate server timestamp-to-observer delivery p95 | 2739 ms |

## Assessment and limitations
Admission isolation, cap enforcement, lease release/reconnect and delivery following a brief Redis transport outage passed in this sample. Performance acceptance remains open: observed aggregate delivery p95 exceeds the existing NF04 two-second realtime target. This is also synthetic publisher timing, not durable domain commit-to-observer timing. The outage interrupted the local REST adapter, not the Redis process or stored data. This test proves resume after transport availability returns, not lost-event replay, automatic client reconnection, provider failover or disaster recovery.

This short single-process run covers 20 users and 500 deliveries. It does not satisfy the specified 15-minute, at least 1000 measured-operation/event acceptance run or prove distributed hosted capacity. Startup p95 is 5.46 seconds versus the prior 1.196-second one-user overridden-limit sample, with a different user/connection distribution; do not interpret it as a controlled regression comparison. No startup percentile budget was approved in the current spec.

Next performance investigation: measure request authentication duration, database pool wait and membership verification duration under distinct users, then inspect poll delays. Identify the bottleneck before changing pool sizing or caching. Preserve authorization freshness and normal admission limits. Report per-phase percentiles and repeat the formal NF03/NF04 acceptance workload after a measured fix.

## Cleanup and reproducibility
The script removed all 20 generated users/profiles and its workspace, closed all streams, stopped the isolated server/REST bridge and stopped the disposable Redis fixture. Existing user workspaces and tasks were not modified. No application code changed; no commit, push or deployment was performed for this test.

Operator fixture: ignored .local-test/distinct-users-load.mjs. Sanitized machine result: ignored .local-test/distinct-load-result.json. Server diagnostics remain local and must not be staged. The fixture uses installed dependencies and ephemeral in-process authentication data; it deliberately does not print credentials.
