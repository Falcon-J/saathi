# Saathi — Three-Day Engineering Mastery and Showcase Guide

**Created:** 2026-09-22

**Purpose:** A focused three-day path to understand Saathi, close verified project gaps in parallel, and prepare an honest repository showcase.

> This is a learning and coordination guide, not evidence that a feature or release gate has passed. Use the implementation, closeout plan, and dated evidence records as authorities for code and status.

## How to use this guide

Run three tracks in parallel, but keep their outputs separate:

1. **Understand:** learn one system boundary at a time and explain it without memorized buzzwords.
2. **Complete and verify:** follow the [production readiness closeout plan](../superpowers/plans/2026-09-21-saathi-production-readiness-closeout.md). Record actual outcomes in release evidence; do not infer completion from this guide.
3. **Showcase:** prepare the repository, demo, architecture explanation, and interview answers using evidence that has actually been checked.

Suggested daily rhythm: two learning blocks, one implementation/verification block, and one short teach-back. Keep a glossary and evidence log. If a check is blocked, record the blocker and owner; do not relabel it as a pass.

## The project in one minute

Saathi helps a small team turn a shared outcome into visible, assigned, and completed work. A workspace is both the collaboration boundary and the authorization boundary. The v1 product includes workspaces, tasks, membership and invitations, comments, activity, realtime updates, and optional AI assistance.

```text
Browser → Server Action/route → verify session + membership → domain/data operation
  → PostgreSQL transaction → activity + durable outbox → Redis/SSE notification
  → clients reconcile from PostgreSQL
```

Supabase Auth owns identity and sessions. PostgreSQL owns durable product facts. Redis/SSE deliver temporary notifications but do not replace database truth. AI may interpret or draft, but deterministic application code validates, authorizes, and persists confirmed actions.

## Learning sequence

For each section, explain the concept in your own words, trace one real code path, inspect a focused test, and answer the interview prompt without notes.

### 1. Product, actors, and domain language

**Learn:** the user problem, journeys, workspace boundary, and terms such as owner, member, task, invitation, activity event, realtime event, and workspace version.

**Read:** [Domain context](../../CONTEXT.md), [Product requirements](../product/saathi-v1-product-requirements.md), and the [project map](../architecture/saathi-v1-project-map.md).

**Exercise:** draw `sign up → enter/create workspace → collaborate on tasks → invite another member → see updates`; annotate success and failure states.

**Interview prompt:** What problem does Saathi solve, and why is workspace the right collaboration and access boundary?

**Mastery evidence:** a 30-second product pitch that explains value before technology.

### 2. Web application and codebase fundamentals

**Learn:** browser/server boundaries, HTTP, React rendering, Next.js Server Actions and route handlers, TypeScript contracts, validation, and the modular-monolith tradeoff.

**Trace:** `app/` routes/actions, `components/` UI, `hooks/` client behavior, and `lib/` domain/data/infrastructure boundaries.

**Exercise:** follow one task form submission from its component through the server action and back. Identify which code may run in the browser and which must remain server-only.

**Interview prompt:** Why keep this as a modular monolith today? What measured signal might justify extracting a service?

**Mastery evidence:** a source map with entry point, validation, authorization, persistence, side effect, and response.

### 3. Authentication and account email

**Learn:** authentication vs authorization; identity vs profile; session verification; signup confirmation; password recovery; OAuth callback; SMTP; sender-domain authentication; redirect allowlists.

**Start with:** `app/(auth)/`, `app/auth/callback/`, `lib/auth-simple.ts`, `lib/supabase/`, `components/auth-form.tsx`.

**Exercise:** draw signup and password recovery separately. For every hop, identify whether Supabase Auth, Saathi, SMTP, DNS, or browser owns it. Include delayed/rejected email and expired-link cases.

**Interview prompt:** If SMTP accepts a message but signup cannot complete, what is known, unknown, and where do you investigate?

**Mastery evidence:** explain why email transport does not own identity, why redirects are allowlisted, and why provider acceptance is not inbox proof.

### 4. Relational data, transactions, and invariants

**Learn:** keys, constraints, transactions, migrations, optimistic concurrency, and database-enforced invariants.

**Read:** [PostgreSQL source-of-truth ADR](../adr/0001-postgres-source-of-truth.md), `lib/db/schema.ts`, `lib/db/client.ts`, and `lib/data/`.

**Exercise:** sketch users, workspaces, memberships, tasks, invitations, comments, activity, and outbox relationships. Explain workspace scoping and invariants under concurrent requests.

**Interview prompt:** Two users edit a task simultaneously. How do you prevent silent overwrite?

**Mastery evidence:** explain version checks and what a conflict means to the user.

### 5. Authorization and tenant isolation

**Learn:** authentication does not imply access; identifiers are not authorization; current membership must be checked at the server boundary.

**Read:** `lib/workspace-policy.ts`, `lib/task-permission.ts`, `lib/session-boundary.ts`, `app/actions/`, and negative authorization tests.

**Exercise:** create a matrix for owner, member, removed member, and non-member across workspace/task reads and writes, comments, invitations, realtime, and AI.

**Interview prompt:** How do you prove a user cannot access a workspace by guessing its ID?

**Mastery evidence:** identify the authoritative server check and the negative test for each boundary you discuss.

### 6. Domain mutations, idempotency, and activity

**Learn:** validate → authorize → mutate → record activity → return a typed outcome; distinguish retry-safe requests from duplicate side effects.

**Trace:** task operations in `app/tasks/actions.ts` and `lib/data/tasks.ts`; comments in `app/actions/comments.ts` and `lib/data/comments.ts`; invitations in `app/actions/invitations.ts` and `lib/data/invitations.ts`.

**Exercise:** choose task completion or invitation acceptance. Describe success, stale version, repeated submission, permission loss, and database failure.

**Interview prompt:** What does idempotency protect against, and what remains authoritative when a request is retried?

**Mastery evidence:** an explicit list of durable state transitions and terminal states.

### 7. Outbox, Redis, SSE, and eventual delivery

**Learn:** why a database commit and external publish are not one atomic operation; transactional outbox; retries; duplicate/out-of-order messages; reconnect and reconciliation.

**Read:** [Realtime guide](../realtime.md), [Reliability guide](../reliability.md), `lib/data/events.ts`, `app/api/internal/outbox/route.ts`, `lib/redis-streams.ts`, `lib/realtime.ts`, `lib/realtime-sse.ts`, and `hooks/useSSE.ts`.

**Exercise:** narrate the success path and the path where PostgreSQL commits but Redis is unavailable. Then explain how a disconnected client recovers missed state.

**Interview prompt:** Why is SSE/Redis a notification path rather than the source of truth? How do you make a missed event harmless?

**Mastery evidence:** a sequence diagram for transaction, outbox retry, notification, reconnect, and PostgreSQL reconciliation.

### 8. Invitations and email delivery reliability

**Learn:** invitation lifecycle, normalized recipient identity, expiry, wrong-recipient behavior, duplicate acceptance, delivery state, webhook verification, bounce/complaint handling, and manual link fallback.

**Read:** `lib/invitation-domain.ts`, `lib/data/invitations.ts`, `lib/data/invitation-emails.ts`, `lib/email-delivery.ts`, `lib/email-webhook.ts`, `app/api/webhooks/email/route.ts`.

**Exercise:** build a state-transition table for pending → accepted, declined, revoked, or expired. Explain why sending an invitation and granting membership are separate transitions.

**Interview prompt:** What if the provider sends an email but its webhook is delayed or duplicated?

**Mastery evidence:** describe the authorized membership transition independently from delivery status.

### 9. AI as a bounded, non-authoritative assistant

**Learn:** minimal authorized context, server-only provider access, schema validation, feature flags, rate limits, reviewed drafts, deterministic commands.

**Read:** `app/actions/workspace-advisor.ts`, `lib/ai/`, `lib/groq-chat.ts`, `lib/workspace-intent.ts`, `lib/data/ai-operations.ts`.

**Exercise:** trace an AI-proposed task change. Mark where the model stops and deterministic authorization/validation/persistence begin. Include invalid output, timeout, disabled feature, and unauthorized workspace.

**Interview prompt:** How do you prevent a model from granting access, claiming an uncommitted change succeeded, or seeing another tenant's data?

**Mastery evidence:** explain the provider boundary and show that confirmation returns through the normal authorized mutation path.

### 10. UI states, accessibility, and user trust

**Learn:** loading, empty, error, retry, conflict, offline, permission-denied, and success states; responsive layout, keyboard use, and asynchronous feedback.

**Read:** `app/dashboard/`, `app/tasks/`, `components/workspace-overview.tsx`, `components/task-list.tsx`, and [visual regression checklist](../design/visual-regression-checklist.md).

**Exercise:** distinguish “no workspaces” from “workspace query failed.” Explain how stale data and network loss should appear to a user.

**Interview prompt:** Why show an empty state only after a successful query?

**Mastery evidence:** demo a failure state and recovery, not only the happy path.

### 11. Testing and evidence quality

**Learn:** unit/contract tests, database integration, two-user acceptance, negative authorization, provider tests, load tests, and local-vs-hosted evidence.

**Read:** `package.json`, nearby `*.test.*` files, `docs/failure-exercises/`, dated release evidence, and the project-map validation section.

**Exercise:** for one invariant, identify its test, environment, what it proves, and what it does not prove.

**Interview prompt:** What is the strongest evidence for multi-user authorization, email delivery, and realtime recovery? What remains unverified?

**Mastery evidence:** report checks precisely: implemented, focused tests passed, locally validated, hosted verified, blocked, or not executed.

### 12. Deployment and production operations

**Learn:** environments, secret handling, health vs readiness, migrations, deployment identity, rollback, backup/restore, alerting, provider outages, operational ownership.

**Read:** [Release evidence](../release/2026-09-22-release-evidence.md), [Operational readiness](../release/2026-09-22-operational-readiness.md), and the closeout plan.

**Exercise:** explain how to diagnose readiness failure, identify deployed source, stop a bad rollout, and restore data without experimenting destructively on production.

**Interview prompt:** What does “production ready” mean here, and what evidence must exist before you say it?

**Mastery evidence:** separate code completion, deployment success, live behavior, and recovery proof.

## Three-day schedule: September 22–24, 2026

This intensive schedule is not a promise that external-provider or human-dependent gates can be completed within three days. The closeout plan remains the implementation checklist.

### Day 1 — Foundations, authentication, and data safety

**Learn:** Sections 1–5. Prioritize product boundary, request path, auth fundamentals, data model, and authorization.

**Work in parallel:** review release-candidate and hosted-environment steps in the closeout plan. Classify each check as local, disposable-user, provider, or owner-dependent. Do not run destructive operations against production.

**Showcase:** write the 30-second pitch and draw the initial architecture flow.

**End-of-day outputs:**

- [ ] Explain the product and workspace boundary without technology jargon.
- [ ] Trace signup, login, and one protected workspace action in source.
- [ ] Draw core table relationships and list the main authorization invariants.
- [ ] Record observed findings in the appropriate evidence file, not as assumptions here.

### Day 2 — Collaboration, realtime, delivery, and AI boundaries

**Learn:** Sections 6–10. Prioritize transactions, invitations, outbox, Redis/SSE, and AI safety.

**Work in parallel:** execute only safe, non-production checks allowed by the closeout plan. Work two-user, provider, or preview validation only when setup and authorization permit. Record blockers and evidence links.

**Showcase:** prepare a task-mutation and failure/reconnect sequence diagram; rehearse the two-user demo.

**End-of-day outputs:**

- [ ] Explain the transaction/outbox/realtime/reconciliation sequence.
- [ ] Explain why AI cannot be authoritative for authorization or persistence.
- [ ] Demonstrate a negative permission case if a safe environment exists; otherwise record it open.
- [ ] Update dated evidence only with observed results.

### Day 3 — Operations, verification, and interview showcase

**Learn:** Sections 11–12. Review tests, external evidence, production failure modes, rollback, and backup/restore ownership.

**Work in parallel:** advance remaining closeout items that are safe and available. Keep provider/DNS, two-user, load, backup/restore, and accessibility gates visibly open until evidence exists.

**Showcase:** complete the repository checklist, rehearse the demo, and conduct a mock interview using the question bank below.

**End-of-day outputs:**

- [ ] README has a clear path for setup, configuration, run, test, architecture, and demo.
- [ ] Architecture/project-map links are discoverable and consistent with code.
- [ ] Demo covers happy path, authorization, collaboration/recovery, and one honest limitation.
- [ ] Interview answers distinguish verified evidence from planned or unverified work.
- [ ] Release status comes from current dated evidence, never from this schedule.

## Parallel completion and evidence track

Use the [production readiness closeout plan](../superpowers/plans/2026-09-21-saathi-production-readiness-closeout.md) for task order and safety constraints. Use the dated release and [operational readiness](../release/2026-09-22-operational-readiness.md) records for observed status.

Classify each validation by its evidence boundary:

| Evidence boundary | Example | Does not prove by itself |
| --- | --- | --- |
| Source review | A route checks workspace membership | Hosted configuration is correct |
| Focused automated test | A negative permission contract passes locally | Real provider delivery or deployment behavior |
| Local integration | Database behavior works against disposable local data | Production recovery or hosted access control |
| Preview/manual acceptance | Two disposable users complete a collaboration path | Production environment correctness |
| Provider evidence | A delivery, bounce, or webhook event is observed | Application authorization correctness |
| Production health check | A live route responds | Correct source SHA, two-user behavior, or recovery readiness |

Record each meaningful gate:

```text
Requirement:
Environment and source version:
Expected behavior:
Observed behavior:
PASS / FAIL / PARTIAL / BLOCKED / NOT RUN:
Evidence location:
Owner and next action (if open):
```

Never use production data for learning experiments. Prefer local or separately configured preview environments, disposable accounts, reversible operations, and tested rollback procedures.

## Repository showcase checklist

These are review criteria, not claims that each item is already satisfied.

### A new engineer should be able to

- [ ] Understand the product, supported v1 scope, and non-goals from the README.
- [ ] Find the architecture diagram, project map, domain terms, ADRs, and interview brief.
- [ ] Configure local development from variable names and safe examples without seeing secrets.
- [ ] Start the app and run supported lint, type-check, test, build, environment-validation, and database-check commands.
- [ ] Understand which tests need a disposable database and why missing database configuration must not silently pass.
- [ ] Find migration, failure-exercise, release-evidence, and operational-recovery guidance.

### A reviewer should be able to verify

- [ ] Server-side identity and membership checks protect workspace-scoped reads and writes.
- [ ] Durable mutations, activity, and outbox obligations have clear transaction ownership.
- [ ] Redis/SSE delivery failures do not redefine committed PostgreSQL state.
- [ ] AI output is bounded, validated, and unable to bypass deterministic authorization.
- [ ] Tests cover important contracts and failure paths, not only happy paths.
- [ ] Release claims link to dated evidence and identify what remains blocked or unverified.

### A five-minute demo should show

1. The user problem and central shared-workspace journey.
2. Creating/selecting a workspace and managing a task.
3. A second user or recorded safe scenario demonstrating collaboration and authorization.
4. Recovery after missed realtime delivery, or an explicit note if that hosted scenario remains unverified.
5. One design decision: PostgreSQL as truth, outbox, optimistic concurrency, or bounded AI.
6. A genuine limitation and the evidence or action needed to close it.

## Interview practice bank

Answer in this order: **requirement → invariant → design → failure case → evidence/tradeoff**.

1. Design a small team workspace app. What are its core entities and access boundaries?
2. How do you prevent cross-workspace data access when a user guesses an identifier?
3. Two collaborators update one task concurrently. How do you avoid silent data loss?
4. PostgreSQL commits but Redis is unavailable. What does the user see, and how does recovery work?
5. A client disconnects and misses events. How does it regain authoritative state?
6. An invitation is accepted twice or by the wrong email. What invariants protect membership?
7. The email provider accepts a message, but the user reports no email. What do you check, and what can you claim?
8. How can AI help without becoming an authorization or persistence authority?
9. What would you monitor, alert on, and rehearse before a beta release?
10. Which claims are supported by local tests, hosted checks, and real two-user/provider evidence?

For every answer, draw the sequence and name the code owner. If you cannot identify the owning module or evidence, mark it as a study question rather than guessing.

## Completion rubric

The three-day effort is successful when:

- **Fundamentals:** You explain authentication, authorization, transactions, idempotency, optimistic concurrency, outbox, eventual delivery, and AI authority boundaries plainly.
- **Repository fluency:** You trace signup/recovery, task mutation, invitation acceptance, realtime recovery, and AI advice from UI to authoritative boundary.
- **Evidence discipline:** You distinguish local, preview/hosted, manual, and unverified results.
- **Showcase:** README, architecture, local setup, validation commands, demo, and known limitations are easy to find.
- **Honesty:** The public project description matches current dated evidence; unresolved gates are not hidden behind “production ready.”

This guide does not establish these outcomes. Record proof in source documents and update the interview brief only when evidence changes.

## Existing source-of-truth documents

- [Repository README](../../README.md)
- [Domain context and invariants](../../CONTEXT.md)
- [Product requirements](../product/saathi-v1-product-requirements.md)
- [Architecture and capability map](../architecture/saathi-v1-project-map.md)
- [Technical architecture](../architecture/saathi-v1-technical-architecture.md)
- [PostgreSQL source-of-truth ADR](../adr/0001-postgres-source-of-truth.md)
- [Realtime behavior](../realtime.md)
- [Reliability behavior](../reliability.md)
- [Production readiness closeout plan](../superpowers/plans/2026-09-21-saathi-production-readiness-closeout.md)
- [Current release evidence](../release/2026-09-22-release-evidence.md)
- [Current operational readiness](../release/2026-09-22-operational-readiness.md)
- [Existing interview brief](saathi-v1-interview-brief.md)
- [Visual regression checklist](../design/visual-regression-checklist.md)
