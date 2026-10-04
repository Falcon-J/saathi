# Core audit fixes implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. User authorized implementation with FIX; no commits or deployment.

**Goal:** Fix the six concrete write and synchronization defects from the core audit.

**Architecture:** Preserve the modular monolith and two-stage UI. Isolate post-commit side effects, use stable create identifiers, arbitrate reads, and reduce repeated storage work.

**Tech Stack:** Existing Next.js, React, TypeScript, PostgreSQL and Redis.

**Spec:** The six ranked findings in the preceding user-visible core audit.

## Constraints

- Preserve accumulated working-tree changes and existing authorization checks.
- Existing database is authorized test infrastructure; no fresh deployment or Git mutation.
- Implement directly in the current feature checkout; no dependencies or framework migration.

## Review focus

- Lost acknowledgements must not permit duplicate task/comment/import creates.
- Account switches and A-to-B-to-A navigation must reject old results.
- Event bursts must cause bounded refresh work with a trailing refresh.
- Idle SSE must stay inexpensive without delivering events after membership revocation.
- Notification failure must not turn a committed write into failure.

## Tasks

### Task 1: Reliable command outcomes
- [x] Add runtime action regression: committed write plus failing cache invalidation returns success.
- [x] Run regression red, isolate revalidation, return unknownOutcome for uncertain writes.
- [x] Add stable task/comment create IDs and deterministic CSV row IDs; verify duplicate and mismatched retries against PostgreSQL.
- [x] Update UI retry handling and test lost acknowledgement and refresh failure separately.

### Task 2: Read arbitration and scope
- [x] Add reordered-read and event-burst regressions, run red.
- [x] Share task read generations across initial loads and refreshes, coalesce realtime resync with trailing work.
- [x] Scope workspace creation/removal and error notifications to their captured selection.
- [x] Run affected hook regressions.

### Task 3: Storage and delivery costs
- [x] Add runtime query-count and idle-poll regressions, run red.
- [x] Replace workspace N+1 reads with two set-based queries.
- [x] Slow idle polling; check membership on event batches and periodic idle checks before emitting data.
- [x] Defer durable outbox flush beyond domain responses using existing runtime and worker paths.
- [x] Run full tests, type check, lint, database tests and build; review final changes and record limits.

## Progress

All three tasks implemented and verified. See docs/release/2026-10-04-core-audit-fix-evidence.md.

Rulings: current dirty feature checkout reused; no Git mutations authorized. Existing hosted database is explicitly test-only; normal migration replay failed because the baseline journal is empty, so only the new receipt migration was applied transactionally. This leaves migration-journal reconciliation for deployment day. Pagination and full-reload task/comment retry persistence remain explicit limits, rather than silently truncating data or adding storage behavior.

Independent review: two concrete findings, both fixed with red-to-green regressions. Final main suite 205 passed / 1 separately verified database skip; database final files 38 passed; type/lint/build passed. No second independent review claimed.
