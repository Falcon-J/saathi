# Saathi — Outcome-driven collaborative workspace

> **Move from intention to action, together.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Redis](https://img.shields.io/badge/Upstash-Redis-red?logo=redis)](https://upstash.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Highlights

- **Execution-first Overview** that separates Today, Next, and Completed work
- **Detailed Board** for status, priority, date/time due dates, estimates, assignment, filtering, and CSV import
- **Optional Groq assistant** for bounded workspace planning and single safe task changes
- **Event-driven backend** using native Redis Streams (`XADD`/`XRANGE`) with cursor-based SSE consumers
- **Per-event real-time latency instrumentation** via Server-Sent Events
- **Three serverless workflows** (Tasks, Workspaces, Invitations) using Next.js Server Actions
- **Optimistic UI** with SSE-based deduplication — zero flicker on collaborative edits
- **Durable usage counters** for task creation/completion, member growth, and unique contributors
- **Stateless server layer** designed for serverless deployment with Redis-backed authority
- **Explicit reliability contract** covering authenticated subscriptions, bounded replay, duplicate-safe delivery, resync after retention gaps, and targeted Redis-backed task limits

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
    ├── Auth: cookie → Redis session lookup
    ├── Poll: XRANGE every 100ms (cursor-based)
    └── Heartbeat: presence refresh every 30s
        │
        ▼ Upstash REST
Upstash Redis
  stream:{workspaceId}    ← Redis Stream (event log, XTRIM 1000)
  session:{id}            ← Auth sessions (24h TTL)
  workspace:{id}          ← Workspace + member data
  task:{id}               ← Task records
presence:{wsId}:active  ← Online users (5min TTL)
```

### Internal Module Ownership

Saathi is intentionally a modular monolith: one Next.js deployment with explicit code ownership and one Redis authority.

| Module | Current owner | Responsibility |
|---|---|---|
| Identity | `lib/auth-simple.ts`, `lib/passwords.ts` | Sessions, identity, password hashing |
| Workspace | `app/actions/workspaces.ts` | Workspaces, membership, invitations, ownership |
| Work | `app/tasks/actions.ts`, `hooks/use-workspaces.ts` | Task records, permissions, optimistic board state |
| Realtime | `lib/realtime.ts`, `app/api/realtime/route.ts` | Redis Streams, SSE delivery, presence |
| Activity | Workspace and invitation actions | User-visible change history, co-located until volume justifies extraction |
| Migration | `app/actions/migration.ts`, `lib/csv.ts` | Bounded CSV task import with row-level errors |

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
- `GET /api/health/ready` checks that Redis is reachable; it returns `503` when the collaboration service is not ready.

### Workspace Usage

Authenticated workspace members can inspect durable activation signals with:

```text
GET /api/usage?workspaceId={workspaceId}
```

The response reports task creation, task completion, member additions, and unique contributors. These counters live in Redis so they are not tied to one serverless instance.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Upstash Redis (serverless REST) |
| Real-time | Server-Sent Events + Redis Streams |
| Auth | Session-based (httpOnly cookie + Redis) |
| Deployment | Vercel |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm

### Run locally (no Redis needed)

```bash
git clone https://github.com/Falcon-J/saathi.git
cd saathi
npm install
npm run dev
```

The app runs with an in-memory mock Redis by default — no external services required.

Visit [http://localhost:3000](http://localhost:3000)

Register a local account from the sign-up page. Development data stays in the in-memory mock Redis store when Redis credentials are not configured.

---

## Environment Variables

Create `.env.local` in the project root:

```env
# Required for production — skip for local dev (uses mock Redis)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Optional — defaults work for local dev
NEXTAUTH_SECRET=your-secure-random-secret
NEXTAUTH_URL=http://localhost:3000

# Optional AI workspace assistant — keep disabled until configured and verified
NEXT_PUBLIC_ENABLE_AI_WORKSPACE=false
GROQ_API_KEY=your-server-only-groq-key
GROQ_MODEL=openai/gpt-oss-20b
```

Get free Upstash Redis credentials at [upstash.com](https://upstash.com) — the free tier is sufficient.

---

## Deploy to Vercel

```bash
# 1. Push to GitHub
git push origin main

# 2. Import at vercel.com/new
# 3. Add Redis and authentication environment variables
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
│   ├── redis.ts         # RedisService: XADD, XRANGE, XTRIM, GET, SET
│   ├── realtime.ts      # RealtimeService: publishEvent(), readNewEvents()
│   └── auth-simple.ts   # Session management
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
- [ ] Validate the current deployed commit, Redis persistence, authentication, and public `/guide` route against the release gates below.
- [ ] Validate the deployed Vercel environment, Redis persistence, authentication, SSE recovery, two-user collaboration, mobile layout, and deployment logs.
- [ ] Run the authenticated concurrency benchmark and record reproducible p50/p95/p99 evidence before using numeric resume claims.

The permanent `/guide` page documents current assistant capabilities and limits. The AI feature remains off by default.

The authenticated SSE benchmark was not reproducible in the current environment on 2026-09-05 because no disposable authenticated session, workspace ID, or development publisher secret was configured. See [`docs/benchmarks/2026-09-05-authenticated-sse.md`](docs/benchmarks/2026-09-05-authenticated-sse.md) for the exact attempted command and required inputs. No concurrency or latency numbers are claimed.

### Resume wording

Use architecture claims now:

> Built a collaborative task manager with Next.js, TypeScript, Redis Streams, and authenticated Server-Sent Events; centralized workspace authorization and added optimistic task workflows with reconnect handling.

Add measured numbers only after the benchmark evidence is captured. A passing controlled local run can support “validated 200+ concurrent authenticated SSE connections in local testing” plus the measured p50/p95/p99 values. It cannot support a universal production-capacity or fixed-latency claim.

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with Next.js · Upstash Redis · TypeScript · shadcn/ui*
