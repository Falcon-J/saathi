# Review Remediation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task by task.

**Goal:** Resolve the actionable correctness, security, UX, dependency and verification findings from the November QA review.

**Architecture:** Preserve the Next.js modular monolith, PostgreSQL authority, Redis notification transport, and existing Radix/Tailwind components. Repair invariants at their owning layer; keep drafts and navigation context stable without changing permission contracts. Use the current checkout and installed dependencies to avoid duplicating resource-heavy environments.

**Tech Stack:** Next.js, React, TypeScript, PostgreSQL, Supabase Auth, Redis, Node test runner, Playwright.

**Spec:** `docs/release/2026-11-05-persona-qa-review.md`, authorized for implementation by the user.

## Global constraints

- Preserve existing uncommitted QA artifacts and user work; no production mutations or deployment.
- Add failing behavioral regressions before fixes; use Node 22 and existing test conventions.
- Keep production authentication and authorization fail-closed. Do not weaken acceptance targets.
- Reuse current UI components; no new UI framework dependency.
- Run heavy checks sequentially on this memory-constrained host.

## Review focus

- Native SSE inherited IDs must not suppress heartbeat, recovery or error controls.
- Refreshed props must never lend a stale draft a newer version.
- Unauthorized or invalid invitation attempts must not consume another scope's quota.
- Navigation, workspace switches and refresh must not silently lose edits or imply failed reads succeeded.
- Dependency updates and environment repairs must preserve behavior and be independently verified.

## Tasks

- [x] QA-01: integrate real dedup helper in hook tests; demonstrate inherited-ID failure; validate envelope and deduplicate only domain events in `hooks/useRealtime.ts`; rerun hook/realtime tests.
- [x] QA-03/04: regress concurrent limiter admission and unauthorized recipient quota drain; repair `lib/rate-limit.ts`, Redis adapter as needed, `app/actions/invitations.ts` and domain authorization; retain transactional rechecks; run action/domain/Redis tests.
- [x] QA-02 and UX-06/07: regress refreshed-prop settings versions and draft recovery; repair `components/workspace-settings.tsx` and `components/task-list.tsx` using existing components; retain draft on conflict and explicit latest-state review.
- [x] UX-02: make deadline editor timezone explicit and consistent with conversion; test UTC and Asia/Kolkata, calendar dates and DST cases without changing stored instants.
- [x] UX-01/03/04/06: regress task-error gating, selected workspace persistence, accepted-workspace selection, Back/Forward and draft-preserving navigation; fix `hooks/use-workspaces.ts`, dashboard and invitation callback contracts.
- [x] UX-05 and lower-priority findings: simplify Overview's competing work surfaces, preserve task details, improve invitation wording and consequences, verify long titles and focus transitions.
- [x] Dependencies/DX: inspect fresh audit and official advisories, remove unused vulnerable dependencies or update compatible versions, repair project type discovery without deleting unrelated parent files, verify reproducible installation and full build.
- [x] Acceptance: run lint, types, complete unit suite, SQL, real Redis, browser/public and authenticated persona checks sequentially; retry local Auth with cached images and bounded diagnostics. Record operational/provider/performance gaps honestly if environment or external access prevents verification.
- [x] Review final diff independently, update report/evidence/study guide to distinguish repaired from verified and outstanding deployment-specific gates.

## Execution decisions

- Preserve the current checkout on `codex/review-remediation`; avoid a duplicate worktree. A clean locked reinstall was subsequently performed to verify reproducibility.
- Keep browser-local timed input with explicit IANA labels and workspace-zone display; preserve unchanged instants and reject ambiguous/nonexistent new local times.
- Use validated tab-session drafts for cross-route recovery, retaining original versions. Explicit discard clears only the active panel; successful logout clears only that account's draft namespace.
- Retain existing workspace UI on transient refresh failure, with a warning; authoritative server authorization still governs every write.
- Perform the necessary Zod major migration with compatibility regressions because no patched 3.x version exists for the applicable advisory.
- Auth startup recovered on retry. The first cold browser navigation timed out while dashboard compilation was incomplete; retain that evidence and use a longer local compilation allowance without weakening product assertions.
- Clean lockfile reinstall and the final production build passed. Production browser verification avoids cold development compilation; real local Redis remains enabled.
- Subsequent Auth 504 responses exposed misleading credential guidance. Distinguish transient and rate-limited Auth failures without changing credential rejection or authorization.

## Final boundary

The implementation and local verification work above is complete. This does **not** close sustained-capacity or hosted operational acceptance: the 100-user diagnostic failed admission, and the latest eight-user profile still missed the read-latency target. See the remediation ledger for the failed attempts, measured phase distributions, cleanup and the remaining release work. Changes remain local and uncommitted.
