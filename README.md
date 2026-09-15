# Saathi — Outcome-driven collaborative workspace

> **Move from intention to action, together.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ecf8e?logo=postgresql)](https://supabase.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Highlights

- **Execution-first Overview** that separates Today, Next, and Completed work
- **Detailed Board** for status, priority, date/time due dates, estimates, assignment, filtering, and CSV import
- **Optional Groq assistant** for bounded workspace planning and single safe task changes
- **Transactional backend** using Supabase Auth and PostgreSQL for all durable product state
- **Per-event real-time latency instrumentation** via Server-Sent Events
- **Three serverless workflows** (Tasks, Workspaces, Invitations) using Next.js Server Actions
- **Optimistic UI** with SSE-based deduplication — zero flicker on collaborative edits
- **Durable usage counters** for task creation/completion, member growth, and unique contributors
- **Stateless server layer** designed for serverless deployment with PostgreSQL-backed authority
- **Explicit reliability contract** covering authenticated subscriptions, bounded replay, duplicate-safe delivery, resync after retention gaps, and transactional outbox publication

---

## Architecture

```
Browser (React)
  useRealtime() → EventSource → GET /api/realtime
  useWorkspaces() → Server Actions (RPC)
        │
        ▼ HTTP + SSE
Next.js 16 (Stateless)
  Server Actions: tasks / workspaces / invitations
  Route Handler:  GET /api/realtime
    ├── Auth: Supabase session cookie → verified user/profile
    ├── Poll: XRANGE every 100ms (cursor-based)
    └── Heartbeat: presence refresh every 30s
        │
        ├── Supabase PostgreSQL
        │     profiles, workspaces, members, tasks, invitations
        │     activity events, transactional outbox
        │
        ▼ Upstash REST (ephemeral collaboration state)
Upstash Redis
  stream:{workspaceId}    ← Redis Stream (event log, XTRIM 1000)
  presence:{wsId}:active  ← Online users (5min TTL)
```

### Internal Module Ownership

Saathi is intentionally a modular monolith: one Next.js deployment with explicit code ownership. Supabase owns identity and durable state; Redis is limited to rate limits, presence, idempotency claims, and realtime transport.

| Module | Current owner | Responsibility |
|---|---|---|
| Identity | `lib/auth-simple.ts`, `lib/supabase/` | Supabase sessions, identity, profile projection |
| Workspace | `lib/data/workspaces.ts`, `app/actions/workspaces.ts` | Workspaces, membership, ownership |
| Work | `app/tasks/actions.ts`, `hooks/use-workspaces.ts` | Task records, permissions, optimistic board state |
| Realtime | `lib/realtime.ts`, `app/api/realtime/route.ts` | Redis Streams, SSE delivery, presence |
| Activity | `lib/data/events.ts` | Durable activity facts and outbox publication |
| Invitations | `lib/data/invitations.ts`, `lib/email-delivery.ts` | Invitation lifecycle and bounded email delivery |
| Migration | `drizzle/`, `scripts/migrate-database.mjs`, `lib/csv.ts` | Schema migrations and bounded CSV task import |

CSV task imports accept `title`, `description`, `priority`, `dueDate`, `dueAt`, `estimatedMinutes`, and `assigneeEmail`. `dueDate` remains supported for date-only tasks; `dueAt` is an ISO timestamp for a specific time.

Realtime delivers events but never becomes the source of truth; workspace and task records remain authoritative. Extract a gateway, import worker, notification worker, or identity service only when connection volume, job duration, delivery volume, or product boundaries provide measured justification.

### Real-Time Data Flow

```
User A creates task
  → Server Action: XADD stream:{wsId} * type=task-created data={...}
  → SSE poll (100ms): XRANGE stream:{wsId} (lastSeenId, +] COUNT 50
  → SSE event pushed to all subscribers
  → User B's UI updates (latencyMs stamped on each event)
```

The realtime contract and recovery guarantees are documented in [`docs/realtime.md`](docs/realtime.md). Architecture ownership is in [`docs/architecture.md`](docs/architecture.md), and reproducible failure exercises are in [`docs/failure-exercises/`](docs/failure-exercises/).

### Health checks

- `GET /api/health/live` checks that the application process is serving requests.
- `GET /api/health/ready` checks PostgreSQL and Redis; it returns `503` when a required dependency is not ready.

### Workspace Usage

Authenticated workspace members can inspect durable activation signals with:

```text
GET /api/usage?workspaceId={workspaceId}
```

The response reports task creation, task completion, member additions, and unique contributors. These counters are derived from PostgreSQL activity events and remain consistent across serverless instances.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase PostgreSQL |
| Real-time | Server-Sent Events + Redis Streams |
| Auth | Supabase Auth (httpOnly cookie refresh) |
| Deployment | Vercel |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm

### Run locally

```bash
git clone https://github.com/Falcon-J/saathi.git
cd saathi
npm install
npm run db:migrate
npm run dev
```

The app can render locally without external services, but authenticated workspace flows require Supabase and PostgreSQL configuration. Redis remains optional in development for realtime and rate-limit behavior.

Visit [http://localhost:3000](http://localhost:3000)

Register from the sign-up page after configuring the Supabase URL and publishable key. Durable workspaces and tasks are stored in PostgreSQL.

### Disposable local PostgreSQL

The repository includes a local-only PostgreSQL container for migrations and database integration tests. It is not a Supabase Auth server and must not be used with hosted or production data.

```bash
npm run local:postgres:up

# PowerShell
$env:DATABASE_MIGRATION_URL="postgresql://postgres:postgres@localhost:55439/postgres"
$env:DATABASE_TEST_URL="postgresql://postgres:postgres@localhost:55439/postgres"
node scripts/bootstrap-test-database.mjs
npm run db:migrate
npm run test:database

npm run local:postgres:down
```

Local Redis is intentionally not included here: the application uses the Upstash REST contract, while development without Upstash credentials uses its explicit mock adapter. Validate the real Redis path with a disposable Upstash environment before beta release.

---

## Environment Variables

Create `.env.local` in the project root:

```env
## Required for authenticated workspace flows
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
DATABASE_URL=postgresql://server-only-runtime-role:password@host:5432/postgres

## Required for production realtime and scheduled outbox delivery
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
CRON_SECRET=long-random-scheduler-secret

# Local-only migration identity (keep separate from DATABASE_URL)
DATABASE_MIGRATION_URL=postgresql://migration-role:password@host:5432/postgres

# Public callback origin and invitation email delivery
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_API_KEY=your-resend-key
EMAIL_FROM=Saathi <noreply@your-domain.com>

# Optional AI workspace assistant — keep disabled until configured and verified
NEXT_PUBLIC_ENABLE_AI_WORKSPACE=false
GROQ_API_KEY=your-server-only-groq-key
GROQ_MODEL=openai/gpt-oss-20b
```

Use the values in `.env.example`; keep database, auth, Resend, and scheduler credentials server-side.

---

## Deploy to Vercel

```bash
# 1. Push to GitHub
git push origin main

# 2. Import at vercel.com/new
# 3. Add Supabase, PostgreSQL, Redis, email, and scheduler environment variables
# 4. Optionally add the Groq variables and enable the AI feature flag
# 5. Deploy
```

---

## Project Structure

```
saathi/
├── app/
│   ├── (auth)/          # Login + register pages
│   ├── api/realtime/    # SSE endpoint (GET /api/realtime)
│   ├── actions/         # Server Actions: workspaces, invitations
│   ├── dashboard/       # Main workspace dashboard
│   ├── guide/           # Permanent product and assistant guide
│   └── tasks/           # Task actions + stream page
├── components/          # React UI components (shadcn/ui based)
├── hooks/
│   ├── useRealtime.ts   # EventSource wrapper + event dispatch
│   └── use-workspaces.ts # State + optimistic updates
├── lib/
│   ├── data/             # PostgreSQL workspace, task, invitation, and event owners
│   ├── db/               # PostgreSQL connection and schema boundary
│   ├── redis.ts          # Ephemeral streams, presence, rate limits, idempotency
│   ├── realtime.ts       # RealtimeService: publishEvent(), readNewEvents()
│   └── auth-simple.ts    # Supabase identity/profile boundary
└── scripts/
    └── load-test.ts     # 250-connection SSE load test
```

---

## Load Testing

The authenticated local load test opens concurrent SSE connections, publishes tagged events through a development-only endpoint, and reports p50/p95/p99 connection and event-delivery latency.

Set a process-scoped publisher secret, log in to the local app, and pass both the resulting `auth-session` cookie and the ID of a disposable workspace that belongs to that session. Do not commit any of these values:

```bash
$env:LOAD_TEST_COOKIE = "auth-session=..."
$env:LOAD_TEST_SECRET = "your-local-secret"
$env:LOAD_TEST_WORKSPACE_ID = "your-disposable-workspace-id"
npm run load-test -- --connections 250 --duration 30 --events 3 --url http://localhost:3000
```

The test exits `0` only when at least 200 authenticated connections succeed with no connection failures and every generated event is received by every connected client. The publisher endpoint is available only when `NODE_ENV=development` and `LOAD_TEST_SECRET` is configured.

---

## Optional Groq Verification

Groq remains off unless `NEXT_PUBLIC_ENABLE_AI_WORKSPACE=true` is deliberately configured. Before enabling it, set `GROQ_API_KEY` only in the process or deployment environment and run:

```bash
npm run verify:groq
```

The verifier uses synthetic, non-personal prompts and prints only date, model, case name, outcome class, local validation result, and latency. It does not print the key, prompt, cookies, email addresses, or raw provider payloads. The live matrix covers workspace planning and every supported command; deterministic tests cover missing keys, malformed output, refusals, unavailable responses, and rate-limit handling. Verification does not enable the feature flag. See Groq's official [Structured Outputs](https://console.groq.com/docs/structured-outputs) and [rate limits](https://console.groq.com/docs/rate-limits) documentation before selecting or changing the model.

---

## Key Design Decisions

**Why SSE over WebSockets?**
SSE works over standard HTTP/1.1 with no protocol upgrade — compatible with Vercel and all reverse proxies. Browser auto-reconnects via `retry` field. All writes go through Server Actions, so the client→server WebSocket channel is unnecessary.

**Why Redis Streams over Pub/Sub?**
Pub/Sub messages are lost if no subscriber is active. Streams are a bounded, ordered log — each SSE connection maintains its own cursor (`Last-Event-ID`) and independently reads from any retained offset via `XRANGE`. Reconnecting clients replay retained events; when retention has expired, Saathi emits `resync-required` and refetches authoritative task state.

**Why polling instead of blocking stream reads?**
Upstash uses a REST API (not persistent TCP), so `XREAD BLOCK` is not supported. The route polls every 100ms; actual delivery latency must be measured with the authenticated load test and depends on Redis, network, and runtime conditions.

---

## Release gates

- [x] Replace first-visit slideshow onboarding with a permanent product guide.
- [x] Keep Overview focused on quick add, complete/reopen, and safe title edit/delete, with Board as the detailed-control surface.
- [ ] Run the optional Groq assistant against a real key; keep it disabled until the sanitized live matrix passes.
- [ ] Validate the current deployed commit, PostgreSQL persistence, authentication, and public `/guide` route against the release gates below.
- [ ] Validate the deployed Vercel environment, PostgreSQL persistence, authentication, SSE recovery, two-user collaboration, mobile layout, and deployment logs.
- [ ] Run the authenticated concurrency benchmark and record reproducible p50/p95/p99 evidence before using numeric resume claims.

The permanent `/guide` page documents current assistant capabilities and limits. The AI feature remains off by default.

The authenticated SSE benchmark was not reproducible in the current environment on 2026-09-05 because no disposable authenticated session, workspace ID, or development publisher secret was configured. See [`docs/benchmarks/2026-09-05-authenticated-sse.md`](docs/benchmarks/2026-09-05-authenticated-sse.md) for the exact attempted command and required inputs. No concurrency or latency numbers are claimed.

### Resume wording

Use architecture claims now:

> Built a collaborative task manager with Next.js, TypeScript, PostgreSQL, Redis Streams, and authenticated Server-Sent Events; centralized workspace authorization and added optimistic task workflows with reconnect handling.

Add measured numbers only after the benchmark evidence is captured. A passing controlled local run can support “validated 200+ concurrent authenticated SSE connections in local testing” plus the measured p50/p95/p99 values. It cannot support a universal production-capacity or fixed-latency claim.

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with Next.js · Upstash Redis · TypeScript · shadcn/ui*
