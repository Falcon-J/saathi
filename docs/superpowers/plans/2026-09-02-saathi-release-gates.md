# Saathi Release Gates Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Close the remaining non-logo release gaps with an explicit Overview/Board contract, a reproducible Groq verification path, an authenticated workspace-aware SSE benchmark, and honest release/resume evidence.

**Architecture:** Preserve the existing Next.js modular monolith. Overview remains a narrow execution surface; Board remains the sole detailed task-management surface. Groq remains server-side, optional, and non-authoritative. Redis remains persistence/event authority and SSE remains delivery-only. Validation utilities must reuse current contracts and must not introduce production bypasses.

**Tech Stack:** Next.js 16, React 19, TypeScript, Redis Streams, SSE, Node test runner, Groq Chat Completions.

**Constraints:** Logo work is excluded. Preserve unrelated worktree changes. Do not stage, commit, push, deploy, change remote configuration, create live accounts, or mutate live data without separate authorization. Never print API keys, cookies, Redis credentials, or whole environment files.

---

### Task 1: Make the Overview/Board action boundary visible and testable

**Files:**
- Create: `lib/overview-capabilities.ts`
- Create: `lib/overview-capabilities.test.ts`
- Modify: `components/workspace-overview.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `package.json`

**Steps:**
1. Write a failing contract test asserting that Overview permits quick add and complete/reopen, while detailed edit, delete, assignment, priority, due date, status movement, search, and CSV import belong to Board.
2. Run the focused test and confirm it fails because the capability contract does not exist.
3. Add the smallest typed capability contract that passes the test.
4. Add a compact, keyboard-accessible `Open Board` affordance to Overview, wired to the existing local view switch without introducing a second route or mutation path.
5. Run the focused test and nearby dashboard tests.

### Task 2: Make Groq verification reproducible and sanitized

**Files:**
- Create: `scripts/verify-groq.ts`
- Create: `scripts/verify-groq.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Steps:**
1. Write failing tests for a verification summary that includes only date, model, case, outcome class, validation result, and latency, and excludes keys, prompts, cookies, emails, and raw provider payloads.
2. Run the focused test and confirm the missing verification surface fails.
3. Implement a small script that exercises the existing `requestGroqStructuredResponse` boundary with non-personal synthetic cases, refuses to run without `GROQ_API_KEY`, and prints sanitized JSON evidence.
4. Keep `NEXT_PUBLIC_ENABLE_AI_WORKSPACE` unchanged and document that verification does not enable the feature.
5. Run mocked Groq tests. Run the real verification only if a key is already configured, without printing it; otherwise report the exact external gate.

### Task 3: Repair the authenticated benchmark contract

**Files:**
- Modify: `lib/load-test.ts`
- Modify: `lib/load-test.test.ts`
- Modify: `scripts/load-test.ts`
- Modify: `README.md`

**Steps:**
1. Write failing tests for required workspace-ID parsing/validation and benchmark verdict calculation.
2. Run the focused test and confirm it fails because the workspace is currently hard-coded and verdict logic is embedded in the script.
3. Add small pure helpers in `lib/load-test.ts` and consume them from the script.
4. Require `--workspace` or `LOAD_TEST_WORKSPACE_ID`; do not invent or auto-create a workspace.
5. Ensure the report states the expected tagged-event count and fails when any authenticated connection misses an event.
6. Run focused realtime/load-test tests.

### Task 4: Capture only evidence that can actually be produced

**Files:**
- Create: `docs/release/2026-09-02-release-evidence.md`
- Modify: `README.md`

**Steps:**
1. Record the current local checks, current live-deployment drift, Overview/Board decision, and sanitized commands needed for Groq and benchmark verification.
2. If controlled local Redis credentials, an authenticated disposable workspace/session, and a process-scoped publisher secret are available, run the benchmark and record exact results; otherwise mark it blocked without fabricating evidence.
3. If the Groq key is available, run the real matrix and record sanitized results; otherwise mark it blocked.
4. Do not run live signup, CRUD, two-user, or deployment-log mutation checks until a release candidate is deployed and exact live-test authorization is given.
5. Update resume wording to distinguish implemented architecture from measured local evidence and unverified production claims.

### Task 5: Final local verification and review

**Files:** all authorized changed files

**Steps:**
1. Run focused tests for each changed boundary.
2. Run full `npm test`, `npm run lint`, `npm run type-check`, and `npm run build`.
3. Run `git diff --check` and inspect the final diff for secrets, unrelated edits, accidental logo changes, production bypasses, and false readiness claims.
4. Report staged and unstaged state. Do not stage or commit.
