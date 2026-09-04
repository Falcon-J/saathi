# Authenticated SSE benchmark — 2026-09-05

## Status

Blocked before network requests. No benchmark numbers are recorded.

## Intended run

```powershell
npm run load-test -- --connections 250 --duration 30 --events 3 --url http://localhost:3000
```

The existing harness requires all of these controlled inputs:

- `LOAD_TEST_COOKIE` or `--cookie`: an authenticated `auth-session` cookie;
- `LOAD_TEST_WORKSPACE_ID` or `--workspace`: an existing disposable workspace owned by that session;
- `LOAD_TEST_SECRET` or `--secret`: the development-only publisher secret.

## Observed result

The command was smoke-invoked with one connection and stopped before opening a socket:

```text
Load test failed: Provide --workspace or LOAD_TEST_WORKSPACE_ID for an existing workspace owned by the benchmark session.
```

Therefore the following are **not measured**: successful connections, failures, events sent or received, delivery success rate, p50/p95/p99 latency, disconnects, and errors.

## Reproduction requirements

Start the local app with a disposable Redis/session state, sign in with a disposable account, create a disposable workspace, and provide the three values above through the process environment. The local per-user SSE connection limit must also be configured high enough for the intended controlled load test; do not reuse this setting as a production capacity claim.
