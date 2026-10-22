# Auth log follow-up and signed-in acceptance

The supplied Supabase Auth logs identify `raw_user_meta_data` as a JSON string where Auth expects an object. This was caused by double serialization in the disposable QA seed script, not evidence of a general hosted Auth outage. The ignored fixture now uses postgres.js `db.json` for user metadata and identity metadata and asserts both JSONB values are objects. Ordinary password Auth preflight passed and each run cleaned up its three QA users and workspace.

## Current signed-in evidence

A fresh browser run against the local development application with the authorized hosted test database and Supabase Auth passed owner password sign-in and reload persistence, owner task creation and assignment, member completion, owner reload of the saved result, and outsider workspace isolation with a 403 usage response. Realtime was interrupted for this run, so this does not prove live cross-user delivery. Desktop Board had no overflow or serious/critical axe violations.

The inline Board edit path previously omitted the loaded task version. It now sends the task version unless the editor supplied its own captured version, with a focused component regression check. This preserves stale-edit conflict protection.

Mobile had no horizontal overflow, but its active notification UI triggered `button-name`, `list`, and `aria-hidden-focus` axe findings. The shared notification close button now has an accessible name; the remaining Radix toast list/focus-proxy findings still require verification and resolution. Mobile keyboard acceptance was not reached.

Member Board loading timed out in earlier runs but completed in the latest run. Action-name tracing confirmed task-page and aggregate responses completed; no deterministic root cause has been established. Do not call the intermittent loading issue fixed. Temporary component console probes were removed.

## Remaining release gates

The project is not yet complete. Current build and final UI checks, mobile notification accessibility, deterministic signed-in acceptance, live AI provider acceptance, deployed readiness, real email journeys, recovery proof, and sustained performance acceptance remain open. No commit, deployment, production mutation, or existing-user metadata repair was performed.
