# Saathi Release Evidence — 2026-09-02

## Scope

This record covers the approved non-logo release slice: onboarding/guide cleanup, task-editor UX, Overview/Board ownership, optional Groq verification, authenticated SSE benchmark readiness, and current deployment drift.

Commit under test: `c203f2d`. This release candidate is deployed on Vercel.

## Product contract

- Overview owns quick add to Today and complete/reopen.
- Board owns edit, delete, assignment, priority, due date, status movement, search, and CSV import.
- Overview includes an explicit `Open Board` handoff for detailed controls.
- Groq is optional, server-side, and non-authoritative. Existing authorization, Server Actions, and Redis persistence remain the mutation authority.

## Current public deployment

Read-only browser verification on 2026-09-02:

- Vercel reports deployment `c203f2d` as Ready and Current for the Production environment.
- `https://saathi-ten.vercel.app/` loads the public landing page.
- `https://saathi-ten.vercel.app/guide` loads the permanent guide page.

Conclusion: the approved release candidate is deployed. Auth, CRUD, SSE recovery, two-user collaboration, mobile, environment-variable shape, and deployment-log validation remain to be executed against disposable production test data.

No live account was created and no live workspace data was changed during this check.

## Groq verification

Configuration presence check on 2026-09-02:

- `GROQ_API_KEY`: not configured in the current process or `.env.local`.
- `GROQ_MODEL`: not configured; the code default remains `openai/gpt-oss-20b`.
- `NEXT_PUBLIC_ENABLE_AI_WORKSPACE`: not configured; the feature remains disabled by the exact-`true` flag policy.

Local deterministic coverage verifies strict JSON-schema requests, missing-key fallback, HTTP 429 handling, refusals, missing content, invalid JSON, local schema parsing, and sanitized evidence records.

Real-provider verification is blocked until a Groq key is configured outside source control. Run `npm run verify:groq`; retain only its sanitized JSON output. Do not enable the feature merely because the verifier ran.

## Authenticated SSE benchmark

The harness now requires all three controlled inputs:

- an authenticated `auth-session` cookie;
- an existing disposable workspace ID containing that session user;
- a process-scoped development publisher secret.

None is configured in the current process. Therefore no concurrency or latency number is recorded here.

Reproducible command shape:

```powershell
$env:LOAD_TEST_COOKIE = "auth-session=..."
$env:LOAD_TEST_WORKSPACE_ID = "workspace-id"
$env:LOAD_TEST_SECRET = "process-scoped-secret"
npm run load-test -- --connections 250 --duration 30 --events 3 --url http://localhost:3000
```

Pass criteria: at least 200 authenticated connections, zero connection failures, and exactly `connections × events` tagged deliveries. Record p50/p95/p99 connection and delivery latency only from the actual output.

## Local validation

Completed on 2026-09-02 against the final local diff:

- `npm test` — 63 passed, 0 failed.
- `npm run lint` — passed with no reported errors or warnings.
- `npm run type-check -- --incremental false` — passed. The non-incremental flag avoids a Windows permission failure while writing `tsconfig.tsbuildinfo`.
- `npm run build` — passed. Next.js compiled the production build and emitted the expected route table, including `/guide`.
- `git diff --check` — passed; only normal Git LF/CRLF conversion notices were emitted.
- Browser smoke check at `http://localhost:3001`: disposable local signup, workspace creation, Overview rendering, and the `Open Board` handoff were observed. No production data was used.
- `npm run verify:groq` — intentionally exited before provider calls because `GROQ_API_KEY` is not configured.
- `npm run load-test -- --connections 1 --duration 1 --events 1 --url http://localhost:3001` — intentionally exited before network requests because no workspace ID was configured.

## Release decision

Not production-ready yet. Remaining external gates:

1. configure and run the real Groq matrix, or keep AI disabled;
2. run the authenticated local benchmark with disposable credentials and record output;
3. execute live auth, persistence, full CRUD, reconnect, two-user, mobile, environment-shape, and deployment-log checks against the deployed release.
