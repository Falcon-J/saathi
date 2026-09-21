# Saathi operational readiness — 2026-09-22

## Current topology

```text
Git main (6bab6a3)
  -> Vercel Production deployment EZhWUmuCV3Eq2c4fUwFaeDKmniL1
  -> Supabase Auth + PostgreSQL project
  -> Upstash Redis delivery/rate-limit runtime
  -> Resend invitation provider (configuration present; domain delivery not yet evidenced)
```

PostgreSQL owns durable workspace, task, comment, activity, and outbox state. Redis and SSE provide temporary delivery coordination only. Supabase Auth owns identity and sessions. AI remains optional and advisory; deterministic application code owns authorization, persistence, and mutation success.

## Gate matrix

| Gate | Status | Evidence or owner action |
| --- | --- | --- |
| Liveness/readiness | PASS | Both hosted endpoints returned HTTP 200 after redeploy |
| Deployment rollback reference | PASS | Previous Ready deployment remains visible in Vercel |
| Production secret storage | PASS | Sensitive Vercel values are Secret variables; no values recorded here |
| Production/preview separation | PARTIAL | Production verified; Preview still contains older Config entries requiring an intentional preview policy decision |
| Database backup schedule | BLOCKED | Supabase Free Plan does not include scheduled project backups; upgrade or document an external backup owner |
| Restore drill | BLOCKED | Requires a disposable restored database and integrity checks |
| Runtime alerts | BLOCKED | Requires provider alert configuration and an observed alert drill |
| Authenticated SSE benchmark | BLOCKED | Requires disposable authenticated session/workspace and controlled load execution |
| Preview beta benchmark topology | BLOCKED | The publisher route now supports explicitly configured Vercel Preview deployments, but the current Preview deployment is protected and does not have the separate beta environment values required for safe execution |
| Outbox failure/retry drill | BLOCKED | Requires controlled provider/Redis failure injection |
| Email delivery/webhook | BLOCKED | Requires verified Resend domain, DNS, disposable inbox, and webhook event evidence |
| Two-user authorization/UAT | BLOCKED | Requires two disposable accounts and manual browser evidence |
| Accessibility/mobile review | BLOCKED | Requires keyboard and mobile viewport review |

## Incident and rollback minimums

Before calling the beta production-ready, record:

- the on-call/owner contact;
- the last known-good Vercel deployment;
- the database restore owner and tested recovery time;
- the Redis/outbox recovery procedure;
- the email provider failure and retry procedure;
- the health/readiness alert destination;
- the procedure for disabling optional AI without disabling core workspace work.

## Safe operating rule

If Redis, email, or AI fails, durable PostgreSQL mutations must remain authoritative and recoverable. If readiness fails, traffic must not be described as healthy merely because the liveness endpoint responds.
