# Saathi limited beta release

## Released

- Public URL: https://saathi-ten.vercel.app
- PR #9 merged as `94ebc9b5344948cb8264147e3c8643c697000c69`.
- Production deployment: `dpl_ryvtitZkJewyDzdZK4FpWXA75FVZ`.
- Merge tree `7a5e76aa8c503e12a19e3d3edaf2dc928cb5f8d9` exactly matches tested source `27c7a32fb10c7501f1277d7c4d78339bf0c76b7e`. Its CI passed: https://github.com/Falcon-J/saathi/actions/runs/40066386835.
- Recipient-bound copied invitation links and the in-app invitation inbox replace invitation email delivery. Account verification/recovery email remains Supabase Auth's responsibility.

## Production checks

| Check | Observed |
| --- | --- |
| Liveness/readiness | HTTP 200 |
| Unauthenticated user API | HTTP 401 |
| Unauthenticated worker POST | HTTP 401 |
| Authorized worker POST | 2xx verified before activation |
| One-minute schedule | Job 1 active, owned by postgres |
| Scheduled execution | Three consecutive successes, 2.22–2.37 seconds |
| Private HTTP schema | Application roles denied; cron owner allowed |
| Pending outbox at preactivation | Zero |

The worker's secret is stored in Vault and Vercel production configuration. No literal secret is present in the cron command or release artifacts. [Applied worker setup and rollback ordering](2026-10-24-production-worker-setup.md).

## Cost boundary

Vercel Hobby and Supabase Free remained active; no upgrade or purchase occurred. The checked Vercel dashboard's last 30 days showed about 3.3K function invocations, 23m13s CPU, and 39.4 GB-hours of provisioned memory. Supabase's September 30–October 30 period showed 170 monthly users and 0.044 GB egress with no exceeded free quota. A one-minute worker adds approximately 43,200 invocations per 30 days; duration, other traffic, and Redis usage still affect resource limits. The linked Marketplace Redis resource was deleted; production readiness passed, but the active Redis resource's remaining quota was not independently verified.

## Limits retained

This is a limited beta under the user's delegated release decision. Original performance acceptance remains **failed**; no thresholds were lowered and no sustained-capacity claim follows from release. See [performance evidence and replay](2026-10-24-performance-follow-up.md).

Functional local, preview, and production checks are separate evidence. Production Google sign-in persistence and an authenticated production AI call must be recorded separately from infrastructure readiness. No unrelated customer data, paid plan, or authentication policy was changed.
