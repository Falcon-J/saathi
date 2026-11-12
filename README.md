# Saathi

Saathi is a collaborative task workspace for teams coordinating dependent work. Create and assign tasks, connect prerequisites, and use **Ready and Waiting** to see what can move forward and what needs attention from someone else.

[Open Saathi](https://saathi-ten.vercel.app) · [Product guide](https://saathi-ten.vercel.app/guide)

## How it works

1. Create a workspace and invite teammates with a private, expiring, single-use link.
2. Add tasks, assign responsibility, and connect prerequisite tasks.
3. Use **Ready and Waiting** to understand the next steps. Inspect prerequisites and the work depending on each task.
4. Complete or reopen work. Teammates receive live updates, and readiness changes with the dependency graph.

Readiness is guidance, not a restriction on completing a task. Completed work with unfinished prerequisites remains visible for review.

## Capabilities

- **Canvas:** zoom between workspace and task blocks, keep a scoped command bar within reach, and open existing task controls without losing the canvas.
- **Overview and Board:** ready and waiting work, plus detailed status, priority, assignment, due dates, estimates, filters, and CSV import.
- **Collaboration:** comments, activity history, live updates, and workspace membership management.
- **Permissions:** company and section capabilities narrow workspace membership and existing owner, creator, and assignee rules. Access is enforced in reads, writes and live updates.
- **Recovery:** retained drafts, version-conflict handling, duplicate-safe retries for supported commands, and reconciliation after interrupted connections.
- **History:** archived workspaces and tasks retain a read-only record of past work.
- **Agent connections:** authenticated MCP tools for workspace and task operations, dependencies, collaboration, access and agent coordination. Runs report progress and evidence; completing reviewed work requires a human decision. [OAuth setup](docs/operations/mcp-activation.md) is required before enabling connections.
- **Optional AI assistance:** workspace planning, summaries, attention items, and task drafts. Task creation requires review; the assistant does not autonomously manage membership or assignments.

The [product guide](https://saathi-ten.vercel.app/guide) explains current workflows and assistant limits.

## Architecture

Saathi is a modular monolith: one Next.js application with typed server actions and explicit domain boundaries. PostgreSQL holds authoritative application records; Supabase Auth supplies identity. Redis supports rate limits, presence, and realtime transport.

| Layer | Implementation |
| --- | --- |
| Application | Next.js App Router, React, TypeScript |
| Interface | Tailwind CSS, shadcn/ui, cmdk and React Flow |
| External agents | MCP SDK, Supabase OAuth and application delegations |
| Identity | Supabase Auth |
| Persistence | PostgreSQL, Drizzle schema and migrations |
| Collaboration | Server-Sent Events and Redis Streams |
| Hosting | Vercel |
| Optional assistant | Groq, controlled by an explicit feature flag |

Mutations validate identity, workspace access, and domain rules on the server. Durable changes and their activity/outbox records commit together. Supported retryable commands retain a receipt so an uncertain response can be retried without repeating the change.

Realtime delivery is recoverable rather than authoritative: clients deduplicate events, replay retained history, and refetch PostgreSQL-backed state when reconciliation is needed. See the [realtime contract](docs/realtime.md) for guarantees and limits.

- [Domain context and state transitions](CONTEXT.md)
- [Engineering handbook](docs/handbook/README.md)
- [Architecture and module boundaries](docs/architecture/saathi-v1-project-map.md)
- [Shared commands and canvas access](docs/adr/0002-shared-commands-and-canvas-access.md)
- [Technical architecture](docs/architecture/saathi-v1-technical-architecture.md)

## Local development

Use **Node.js 22.18 or later** and npm with the committed lockfile. Docker is required for disposable database and authenticated acceptance environments.

```sh
git clone https://github.com/Falcon-J/saathi.git
cd saathi
npm ci
```

Copy [.env.example](.env.example) to `.env.local` and configure development services. Authenticated workspace flows require Supabase Auth and PostgreSQL. Production collaboration requires Upstash Redis; development without Redis credentials uses an explicit mock adapter and does not validate real delivery.

| Configuration | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase connection and identity configuration |
| `DATABASE_URL` | Server-only application database connection |
| `DATABASE_MIGRATION_URL` | Separate server-only migration connection |
| `NEXT_PUBLIC_APP_URL` | Application origin for callbacks and invitation links |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Server-only production Redis access |
| `CRON_SECRET` | Authenticates scheduled outbox delivery |
| `ENABLE_AI_WORKSPACE` | Explicit server-side AI switch; disabled by default |
| `GROQ_API_KEY`, `GROQ_MODEL` | Optional server-only assistant configuration |

`ENABLE_AI_WORKSPACE` takes precedence over the legacy public AI switch. Set it deliberately when configuring the assistant. Keep database, Redis, provider, and scheduler credentials server-side.

After configuring an isolated development database:

```sh
npm run db:migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000). Configure Auth redirect URLs and email delivery for your environment. Private invitation links grant access to whoever possesses the link after signing in and explicitly accepting. Signup confirmation settings do not, by themselves, establish mailbox ownership. See the [authentication configuration notes](docs/handbook/06-simple-auth-rollout.md).

### Disposable database tests

The local PostgreSQL container supports migrations and database integration tests. It is separate from the real Supabase Auth acceptance environment.

```powershell
npm run local:postgres:up
$env:DATABASE_MIGRATION_URL="postgresql://postgres:postgres@localhost:55439/postgres"
$env:DATABASE_TEST_URL="postgresql://postgres:postgres@localhost:55439/postgres"
node scripts/bootstrap-test-database.mjs
npm run db:migrate
npm run test:database
npm run local:postgres:down
```

Run fixture preparation and migration commands only against disposable development/test services. The SQL identity stub above must not be installed in a Supabase Auth database.

## Verification

```sh
npm run lint
npm run type-check -- --incremental false
npm test
npm run test:platform
npm run build -- --webpack
```

Install browser dependencies with `npx playwright install chromium`, then run `npm run test:e2e`. That suite covers public pages; signed-in collaboration needs the separate authenticated acceptance environment.

| Check | Entry point |
| --- | --- |
| Database integration | `npm run test:database` and `npm run test:database:platform` |
| Signup and invitation acceptance | `npm run verify:auth:local` |
| Ready and Waiting, collaboration, recovery, and accessibility | `npm run verify:handoffs:local` |
| Sustained authenticated performance | [Disposable Linux performance workflow](.github/workflows/performance.yml) |
| Optional live assistant validation | `npm run verify:groq` |

The authenticated local verifiers use the isolated Supabase project at `.local-test/supabase-acceptance`. Start the required local services first; the handoff verifier also requires a production build configured for its local origin. The [performance workflow](.github/workflows/performance.yml) provides a reproducible real-Auth performance environment: it provisions disposable PostgreSQL/Auth and Redis, builds the app, runs the workload, exports sanitized evidence, and tears down services.

For a memory-constrained build, set `SAATHI_BUILD_WORKERS=1` in the command environment. On Windows, use Windows-native dependencies; if npm was configured for another OS, install with `npm ci --os=win32`.

### Recorded validation

The [default-branch CI run](https://github.com/Falcon-J/saathi/actions/runs/42766871515) passed lint, type checks, production build, 599 unit tests, 63 database tests, and 16 browser tests. Two optional database cases were skipped in the unit suite; the real database suite ran separately.

A separate [controlled Linux performance run](https://github.com/Falcon-J/saathi/actions/runs/42698922604) exercised 100 authenticated users across four workspaces, with 750 seeded tasks per workspace and 1,000 writes over 15 minutes. It recorded 25,000 recipient deliveries with no missing or duplicate deliveries and no workload errors. Read p95 was 97 ms, write p95 was 184 ms, and the conservative event-delivery p95 upper bound was 545 ms.

These are results from specific revisions and a disposable test environment, not a hosted capacity guarantee. The performance run predates later recovery changes; the linked CI and workload evidence identify the tested revisions.

## Operations

- `GET /api/health/live` checks that the application is serving requests.
- `GET /api/health/ready` checks PostgreSQL and Redis and returns an unavailable response when required dependencies are not ready.
- Workspace members can query `GET /api/usage?workspaceId={workspaceId}` for durable activity counters.
- Keep the optional assistant disabled until its configured provider and supported operations pass live verification.

Deployment requires the application environment, database migrations, Supabase Auth configuration, Redis, and authenticated scheduled outbox delivery. Use isolated preview/test resources for acceptance work.

## Contributing

Track bugs, proposals, and specifications in [GitHub Issues](https://github.com/Falcon-J/saathi/issues). Repository conventions are documented in [AGENTS.md](AGENTS.md) and the [issue tracker guide](docs/agents/issue-tracker.md).
