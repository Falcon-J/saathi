# Pagination and retention delivery

## Implemented

Task discussion uses an additive keyset page API: 50 comments initially, at most 100 per data call, an opaque UUID boundary scoped to the authorized task, and a one-row lookahead to indicate more history. SQL compares the stored timestamp and UUID rather than round-tripping timestamp precision through JavaScript. The UI displays each page chronologically and prepends older pages with ID deduplication. A realtime refresh or successful write returns to the latest page; older history remains available through Load older comments. Membership is rechecked on every page, including archived workspace reads. The legacy full-list data function remains available for compatibility.

The authenticated worker deletes at most 500 published transport copies per invocation after 30 days from publication. Unpublished events, failed delivery obligations, domain activity, comments, tasks and command receipts are retained. Existing AI metadata cleanup retains its 30-day policy. Cleanup does not establish a legal or product data-deletion policy. Worker schedule and alerting still require deployment configuration.

## Task Board migration: delivered October 5

The sequence below is retained as the original acceptance contract. Board paging, server filters, workspace aggregates and authorized detail reads are now implemented. A 137-task fixture verified all pages and search beyond the first page; database tests cover cursor scope, timestamp precision, timezone aggregates and revocation. See [October 5 evidence](../release/2026-10-05-paging-ux-evidence.md). Overview and AI retain complete task projections; representative size benchmarks and broader browser race coverage remain separate checks.

Task list paging must not be installed as a silent LIMIT on a shared task array. The delivered Board is separate from complete Overview and AI projections. The original required slices were:

1. Add an authorized tasks page contract with validated filter/search inputs, deterministic stored timestamp plus ID cursors, bounded page size, and lookahead. Include workspace, filter and ordering scope in the cursor contract so a cursor cannot silently cross result sets.
2. Add a separate workspace aggregate read for counts by status and priority, overdue totals and Overview metrics. Counts describe the whole workspace, independent of the visible page. Keep AI context on an explicit complete or purpose-built bounded projection with declared completeness; do not feed it a visible Board page.
3. Migrate the Board to server-side search and status filters. Reset page state on scope changes, deduplicate realtime updates, reject stale responses, and fetch the next page explicitly. Mutations must reconcile page membership and aggregate counts. Keep CSV/export semantics explicit and complete.
4. Prove >100-task fixtures find matches beyond the first page, counts remain exact, equal timestamps do not skip rows, overlapping realtime reads do not duplicate tasks, and revoked membership blocks every page. Browser acceptance must cover filter changes during pending reads and paging after edits.

## Activity migration

Activity currently returns the latest bounded window of 50 events (maximum 100) without a continuation. Add a descending timestamp/ID cursor, nextCursor metadata, and a Load older activity control before describing history as fully traversable. Preserve the membership check on every page. Test tied timestamps, archived reads and member removal. This remains planned.

## Retention acceptance and remaining operations

Verify published-old deletion and pending/recent preservation against the disposable database. The batch is fixed at 500 and repeat invocations drain eligible rows. Monitor published backlog age and cleanup errors from the worker; configure the scheduler before claiming retention is operational in a hosted environment. An index on published_at may be needed after observing the production plan and row counts. Keep full command receipt snapshots until an explicit expiry contract defines the supported retry window and a tombstone strategy preserves consumed command identifiers. Do not delete activity or workspace domain data without a separately approved product policy.
