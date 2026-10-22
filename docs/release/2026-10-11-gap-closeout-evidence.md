# Gap closeout evidence — 2026-10-11

Scope: current uncommitted worktree on `feature/saathi-interface-refresh`. This follows the completion audit; it does not certify the whole project as complete.

## Implemented

- Activity now exposes 50-record pages and Load older activity. Cursors are UUID boundaries resolved within the authorized workspace; SQL compares the stored timestamp and UUID directly, retaining PostgreSQL microseconds. Every page rechecks membership, including archived reads. Legacy array callers remain compatible.
- The UI retains loaded rows during loading/failure, deduplicates appends, invalidates stale scope/refresh responses, and retries the failed continuation cursor instead of replacing accumulated history with page one. The last behavior was caught by independent review and verified with a failing then passing regression.
- Advisor responses must match the requested capability. Attention references must be unique task IDs from the supplied authorized projection. Unknown references are rejected; this does not establish factual accuracy of free-text answers.
- `scripts/verify-advisor.ts` provides four synthetic real-provider checks with fixed case names and sanitized pass/fail/latency output. Summary and unavailable-facts cases verify response contracts only; semantic grounding still requires acceptance.

## Verification

| Check | Result and scope |
| --- | --- |
| Registered unit/component suite after Activity and advisor guards | 263 tests: 261 passed, two existing integration skips, zero failures |
| Activity continuation/retry regressions | Six component checks passed, including Retry after two loaded pages and a failed third page |
| Advisor-focused checks | 14 passed, including capability mismatch, unauthorized IDs and duplicate IDs |
| Fresh PostgreSQL migration | Passed against new disposable loopback database `saathi_completion_20261011` |
| Complete registered database suite | All eight files passed, zero failures/skips; includes schema, workspaces, collaboration, retry receipts, comments/Activity, usage, retention and task pages |
| Activity/comments database checks | Seven passed; traversal of 137 events, microsecond ordering, workspace cursor isolation, archived reads and membership revocation |
| Public-auth Playwright | 14 desktop/360px-mobile checks passed; keyboard, overflow, redirect and serious/critical axe findings |
| Production build | Final integrated build passed including Activity Retry correction and provider-verification script; 13 static pages generated |
| Full ESLint | Passed before Retry-only UI adjustment; scoped lint passed after adjustment |
| Type checking | Passed including Retry fix and provider-verification script |
| Patch hygiene | `git diff --check` passed, line-ending notices only |

The initial timestamp regression failure was in fixture construction: postgres.js serialized timestamp parameters through JavaScript Date, rounding the two expected microsecond instants into one millisecond. SQL timestamp literals now retain the intended fixture precision, and the test asserts stored precision before traversing. No schema change was needed.

The browser runner's earlier startup stall was environmental: restricted processes could not connect to loopback, and a second server collided on port 3100. Running both the local server and Playwright with approved network/process access yielded the 14-pass result. No app behavior was weakened for testing.

## Signed-in acceptance

The user confirmed existing Supabase/database configuration as test-only and authorized fresh QA accounts/workspaces with cleanup. An ignored operator script `.local-test/completion-acceptance.mjs` prepares isolated owner/member/outsider browser contexts and checks normal login, persistence, assignment/completion, outsider usage denial, mobile layout and accessibility.

Execution remains blocked at ordinary Supabase password authentication: HTTP 500, `Database error querying schema`. Matching database/Auth project, basic Auth-role privileges and synthetic user field initialization were checked. No signed-in journey is claimed passed. Every fixture attempt removed its own generated QA users/profiles/workspace; existing users and workspaces were untouched. No personal browser session, auth bypass or saved credential/state file was used.

Direct SQL Auth fixtures can cause this class of error when required columns are NULL: [official Supabase troubleshooting](https://supabase.com/docs/guides/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44). Tested synthetic primitive fields were initialized, so the exact remaining cause is unresolved. Further read-only diagnostics: Auth health is HTTP 200 at v2.197.0; a nonexistent random account receives normal HTTP 400 invalid_credentials; the MFA factors table exists and the Auth role has SELECT permission. This narrows the failure to matching seeded-user lookup or related-record scanning. Hosted Auth log detail or standard Admin API fixture creation is the next diagnostic requirement. No local server admin key was available, and no global Auth schema/data repair was attempted.

## Live provider and release gates

- `GROQ_API_KEY` was absent when checked; the user selected configuring a test key locally. The verifier correctly refuses to run without it. No provider request was made; the feature flag was not enabled globally.
- Read-only Vercel inspection reports latest production Ready at `c086f7f`, distinct from current local HEAD `9da6551` plus uncommitted changes.
- Fresh public production health checks: liveness HTTP 200, readiness HTTP 503 with `not_ready`. This is a release blocker; liveness does not establish application readiness.
- Supabase project listing shows `Saathi` INACTIVE and `preview-saathi` ACTIVE_HEALTHY. The production dependency mapping has not been established from these names alone, so the inactive project is a diagnostic lead, not a proven readiness root cause.
- A narrow deployment error-log query returned no matching recent records; the readiness handler catches dependency failures without logging a cause.
- Sustained real-user performance, durable commit-to-observer timing, hosted reconnect/replay, actual email delivery/webhooks, scheduled worker/alerts, backup ownership/restore and final deployed acceptance remain open.

No commits, pushes, deployment, production data changes, credential retrieval or global hosted-setting changes were performed.
