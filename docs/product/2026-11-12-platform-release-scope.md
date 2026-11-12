# Canvas and MCP platform release scope

Date: 2026-11-12. Current implementation scope and completion ledger. Earlier one-action pilot language is superseded: the intended release covers the platform's complete supported workflow. Engineering and verification may run in independently testable work packages without reducing that release scope.

## Decisions

- Keep current model/reasoning settings unchanged.
- Reuse the current checkout and preserve all pre-existing changes and user design files.
- Keep Next.js/React/TypeScript, Supabase Auth/PostgreSQL, existing accessible Radix/shadcn components, and the existing reliability contracts.
- Prefer React Flow's MIT-licensed core for canvas interaction; reuse installed cmdk for command discovery. Use CSS/native browser motion and the canvas engine's camera controls before adding another animation dependency.
- Human controls, the command bar, and MCP invoke shared typed capabilities with current server-side policy. Provider inference is optional and external clients may supply it.
- Complete capability coverage means every supported domain operation has a deliberate interface, authorization, recovery contract, and verification. It does not expose passwords, raw SQL, service keys, or disabled legacy mutation entry points to models.

## Capability coverage

| Domain | Release contract | Existing implementation to reuse | Required additional work |
| --- | --- | --- | --- |
| Workspaces | List, inspect, create, edit, archive, delete, transfer ownership | app/actions/workspaces.ts; lib/data/workspaces.ts | Actor-explicit adapters; stable IDs; uniform receipt/version behavior |
| Tasks | Paginated search, inspect, create, edit, assign, explicit set status, delete | app/tasks/actions.ts; lib/data/tasks.ts | Explicit status command for agents; uniform DTOs and durable retries |
| Dependencies | Authorized graph, add/remove prerequisite, computed readiness | lib/data/task-dependencies.ts; lib/next-work.ts | Canvas edges and MCP adapter; no readiness from partial pages |
| Comments | Paginated reads, create with attribution | lib/data/comments.ts | Shared contract and MCP adapter |
| Team/access | List members, leave/remove, ownership rules | lib/data/workspaces.ts | Delegated capabilities must remain narrower than actual membership/ownership |
| Invitations | Private links and supported addressed-invitation lifecycle | lib/data/invitations.ts | Preserve mailbox proof where required; exclude tokens from logs |
| History/archive | Paginated activity, archived workspace/task reads | lib/data/activity.ts; components/archive-history.tsx | Shared query DTOs and canvas presentation |
| Import/usage | Validated CSV import, workspace activity counters | app/actions/migration.ts; lib/csv.ts; lib/usage.ts | Bounded batches; per-row or atomic documented outcomes; no invented global usage metric |
| Canvas | Workspace/task projections, semantic zoom, focus, layout | Existing workspace graph and task editor | Projection model, React Flow renderer, layout persistence, accessible list alternative |
| Company/sections | Company grouping, section boundaries and sharing | Current workspace membership is the starting boundary | New container/grant model; enforce visibility in all queries, commands, events, search, counters and tools |
| Agent coordination | Delegation, execution claims, run status, review/evidence | Existing task versions, comments/activity, outbox | Durable grants/runs/claims; lease fencing; cancellation and version-aware review |
| MCP | Authenticated discovery and execution over complete supported registry | Shared capability/domain contracts | SDK transport; OAuth resource validation; consent/delegation; real-client interoperability |
| Command bar | Scoped deterministic search/actions and visible outcomes | cmdk; current task actions/editor/drafts | Persistent canvas composition; keyboard/mobile focus; AI optional |
| Operations | Setup, migrations, health, alerts, backup/restore, release/rollback, fixture cleanup | Existing scripts, health routes, CI and benchmark | Exercise procedures for the new release and record evidence |

## Shared invariants

- A visual placement is not an access grant. A private workspace referenced from a shared section remains private unless explicitly shared through an authorized operation.
- Current task/dependency invariants and permission checks remain authoritative; no client or MCP annotation grants access.
- A command is committed, rejected, conflicted, or unconfirmed. Only durable server evidence confirms commitment.
- Actor/client command identity must survive lost responses and resource deletion. Existing workspace-cascading receipts alone cannot protect all workspace operations.
- Readiness and connections never reveal hidden records through labels, counts, agent context, activity or events.
- Agent activity shows observed intentions/results and reported progress; animations do not delay commands or invent execution stages.
- No completed permission decisions are cached in a way that weakens membership/delegation revocation.

## Performance choices and acceptance

Browser smoothness and API/MCP latency are separate measurements. React Flow recommends memoized nodes and callbacks, narrow store subscriptions, collapsed trees and simpler styles. Its contextual-zoom example supplies the central semantic-zoom mechanism. Motion/browser documentation explains why transforms and opacity avoid expensive layout work; a new animation framework is not itself a performance fix.

- Render compact authorized workspace summaries at overview; expand and load detail deliberately. Do not mount every editor or comment thread inside every distant node.
- Keep camera/selection updates separate from server data and command-bar subscriptions. Coalesce event bursts; update affected records and reconcile after gaps.
- Use one query owner/cache strategy for each dataset. Cache data by actor and resource scope; never treat cache as authorization.
- Keep MCP results structured, bounded and filtered. Expose domain-specific pagination in tool inputs/results; protocol pagination of tool discovery does not automatically paginate task data.
- Reuse transactions and bounded database reads; measure authorization, SQL, serialization, transport and cold/warm execution separately. Do not route deterministic work through an LLM.
- Measure interaction latency, frame behavior, memory, request count and payload size on defined realistic graph fixtures and a representative lower-powered device profile. Use reduced motion and keyboard navigation as acceptance paths.
- Retain the established real-Auth 100-user/1,000-write/900-second performance gate after relevant changes. Existing targets remain read p95 <=750 ms, event-delivery upper-bound p95 <=2,000 ms, and unexpected failures <1%; new MCP measurements must include authentication and exclude external model inference explicitly.

References: [React Flow performance](https://reactflow.dev/learn/advanced-use/performance), [contextual zoom](https://reactflow.dev/examples/interaction/contextual-zoom), [browser rendering](https://web.dev/articles/rendering-performance), [Motion performance](https://motion.dev/docs/performance), [MCP tools](https://modelcontextprotocol.io/specification/latest/server/tools).

## Completion ledger

- [x] Repository/schema/state inventory and current workflow evidence reviewed.
- [x] Canvas-first core, deterministic command bar and complete-platform MCP direction recorded.
- [x] Independent reuse, authentication and commercial viability reviews obtained.
- [ ] Shared platform contracts and capability coverage implemented and verified.
- [ ] Shared domain execution and complete retry/reconciliation behavior implemented.
- [ ] MCP authentication, delegation, transport and complete executable tool registry verified.
- [ ] Company/section boundaries enforced throughout data and event surfaces.
- [ ] Canvas, command bar and live agent action presentation implemented and verified.
- [ ] Agent claims, runs and review/evidence workflow implemented and verified.
- [ ] Existing and new unit/database/browser/security-boundary checks pass.
- [ ] Production configuration, real-client consent/refresh/revocation, deployment and live journeys verified.
- [ ] Performance acceptance, exact fixture cleanup and operational evidence complete.

This ledger distinguishes completed investigation from working product behavior. No checked investigation item establishes implementation, deployment, market demand or valuation.
