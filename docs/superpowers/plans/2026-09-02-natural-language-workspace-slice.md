# Natural-language workspace vertical slice

**Goal:** Let an authenticated user describe an outcome, persist a small actionable workspace in the existing Redis model, and manage its immediate work from a quiet Overview while retaining the current board.

**Architecture:** Keep the Next.js modular monolith. The non-AI Overview and manual workspace flow are always available. An optional, off-by-default Groq adapter returns strict JSON; Zod validates it before existing workspace/task actions persist anything. Redis remains authoritative, existing authorization and realtime publication remain in their current action boundaries, and generation compensates by deleting the new workspace if any generated task cannot be stored.

**Non-goals:** No new service, database, auth system, state library, agent loop, calendar, voice, analytics, hierarchy, or board rewrite.

## Verified reusable boundaries

- `app/actions/workspaces.ts`: authenticated workspace creation, rename, delete, membership, Redis persistence.
- `app/tasks/actions.ts`: authenticated task CRUD, membership/permission checks, optimistic conflict contract, Redis persistence, realtime and usage side effects.
- `hooks/use-workspaces.ts`: client workspace/task state, optimistic updates, refresh and realtime reconciliation.
- `components/task-list.tsx`: existing board implementation; retained unchanged except for accepting the extended task shape.
- `app/dashboard/page.tsx`: composition boundary where Overview becomes the default and Board remains selectable.

## Implementation tasks

1. Add strict Zod contracts and failing tests for generated plans, supported commands, and execution metadata.
2. Add a server-only Groq Chat Completions adapter using built-in `fetch`, `GROQ_API_KEY`, optional `GROQ_MODEL`, strict JSON schema, local re-validation, and an off-by-default `NEXT_PUBLIC_ENABLE_AI_WORKSPACE` gate.
3. Extend existing workspace/task records with optional summary, target date, bucket, and estimate fields while preserving existing callers.
4. Add authenticated orchestration actions that compensate on partial generation failure and apply commands through existing actions after stable-ID validation.
5. Add the intent form, Overview, command bar, Overview/Board switch, and Start something new entry while preserving the current board.
6. Run focused and full tests, lint, type-check, build, diff checks, and the manual core flow where credentials permit.

## Acceptance evidence

- Invalid model output creates no workspace; generated-task failure removes the just-created workspace and tasks.
- Generated data survives refresh because it uses existing Redis records.
- Today/Next/Completed render from persisted fields; legacy open tasks default to Today.
- Complete/add/move/rename commands mutate only the selected authorized workspace.
- Board CRUD, auth, SSE, membership, and existing routes retain their contracts.
