# Saathi — Collaborative Task Manager

> **Real-time task management powered by Redis Streams and Server-Sent Events**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Redis](https://img.shields.io/badge/Upstash-Redis-red?logo=redis)](https://upstash.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Highlights

- **Event-driven backend** using native Redis Streams (`XADD`/`XREAD`) — supports **200+ concurrent users** in local load testing
- **Sub-50ms real-time delivery** via Server-Sent Events with per-event latency instrumentation
- **3 serverless workflows** (Tasks, Workspaces, Invitations) using Next.js Server Actions
- **Optimistic UI** with SSE-based deduplication — zero flicker on collaborative edits
- **Stateless server layer** — horizontally scalable, deploys to Vercel edge network

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
    ├── Poll: XREAD every 100ms (cursor-based)
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

### Real-Time Data Flow

```
User A creates task
  → Server Action: XADD stream:{wsId} * type=task-created data={...}
  → SSE poll (100ms): XREAD stream:{wsId} {lastSeenId} COUNT 50
  → SSE event pushed to all subscribers
  → User B's UI updates (latencyMs stamped on each event)
```

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

### Register or use the demo account

| Field | Value |
|---|---|
| Email | `demo@saathi.build` |
| Password | `demo` |

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
```

Get free Upstash Redis credentials at [upstash.com](https://upstash.com) — the free tier is sufficient.

---

## Deploy to Vercel

```bash
# 1. Push to GitHub
git push origin main

# 2. Import at vercel.com/new
# 3. Add environment variables (UPSTASH_REDIS_REST_URL + TOKEN)
# 4. Deploy
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
│   └── tasks/           # Task actions + stream page
├── components/          # React UI components (shadcn/ui based)
├── hooks/
│   ├── useRealtime.ts   # EventSource wrapper + event dispatch
│   └── use-workspaces.ts # State + optimistic updates
├── lib/
│   ├── redis.ts         # RedisService: XADD, XREAD, XTRIM, GET, SET
│   ├── realtime.ts      # RealtimeService: publishEvent(), readNewEvents()
│   └── auth-simple.ts   # Session management
└── scripts/
    └── load-test.ts     # 250-connection SSE load test
```

---

## Load Testing

Validate the 200+ concurrent user claim:

```bash
npm run load-test
# or with options:
npx tsx scripts/load-test.ts --connections 250 --duration 30 --url http://localhost:3000
```

Output includes p50/p95/p99 for connection time and event delivery latency. Exits `0` if 200+ connections succeed.

---

## Key Design Decisions

**Why SSE over WebSockets?**
SSE works over standard HTTP/1.1 with no protocol upgrade — compatible with Vercel and all reverse proxies. Browser auto-reconnects via `retry` field. All writes go through Server Actions, so the client→server WebSocket channel is unnecessary.

**Why Redis Streams over Pub/Sub?**
Pub/Sub messages are lost if no subscriber is active. Streams are a persistent, ordered log — each SSE connection maintains its own cursor (`lastSeenId`) and independently reads from any offset via `XREAD`. Reconnecting clients resume from the current timestamp, not the beginning.

**Why polling instead of blocking XREAD?**
Upstash uses a REST API (not persistent TCP), so `XREAD BLOCK` is not supported. 100ms polling gives ~50ms median event delivery (average wait = half the poll interval) while keeping Redis request volume manageable at ~10 reads/connection/second.

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with Next.js · Upstash Redis · TypeScript · shadcn/ui*
