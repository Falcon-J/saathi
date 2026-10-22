# Saathi design review and implementation plan

Date: 2026-10-21
Execution update, 2026-10-22: see [current evidence and remaining gates](../../release/2026-10-21-completion-execution.md). Local fixes, integrated production journeys and live AI acceptance have progressed; this document alone does not certify release completion.
Scope: Finish the approved Saathi v1 product and interface, then establish release readiness. This plan reconciles the Compact B design map, the 2026-10-11 completion audit, 2026-10-11 gap closeout, 2026-10-12 Auth follow-up, and current implementation worktree. It does not certify current code or hosted services.

## Goal

### Final scope decisions and execution order, October 23

The agreed first-release workflow is shared commitment → reviewed plan → clear ownership → execution → verifiable updates, initially for reachable small software delivery teams. Customer adoption and defensibility remain hypotheses; benchmarks demonstrate engineering behavior rather than market demand.

Preserve read-only archives without restoration, the existing bounded AI capabilities without new source-link/connector features, and existing Activity continuation. These are the release defaults, not reasons to reopen implementation scope.

1. Record the user's concise-interface and UX/DX/AX rules in `AGENTS.md`; preserve essential accessibility, errors and recovery context.
2. Review and publish the existing product fixes, focused regressions, local acceptance runners and accurate evidence as coherent feature-branch commits and a PR. Preserve newer main-branch behavior; do not infer merge or production deployment approval.
3. Diagnose the failed sustained workload with intended/achieved throughput, schedule lag and generator/server/database/Redis measurements. Change only the measured owning layer, retain the failed baseline, then repeat the same acceptance envelope. The 100-user run failed duration/read/delivery targets despite complete persisted writes and recipient delivery.
4. Close deliberate timed revocation and offline/reconnect reconciliation, remaining configured auth/email and product recovery journeys, and hosted operational gates already listed below.
5. Extend the existing verifier to export sanitized run identity, code revision/working-tree fingerprint, environment, thresholds, achieved rate, latency percentiles, missing/duplicate delivery counts, and timestamped samples without task content or credentials. Reuse a local report for recorded timeline playback and before/after comparison; clearly distinguish playback from a fresh run. Reuse current AI tests/provider checks for a small repeatable grounding, isolation, failure-recovery and confirmed-write eval set. Build no separate monitoring or eval platform.

Implementation completion and hosted release readiness retain separate verdicts in the execution ledger. Do not repeat a full load run before a concrete diagnostic finding justifies it.

Make the primary small-team journey clear and dependable: choose a workspace, see what needs attention, add or complete work, and open details when needed. Close functional and operational acceptance against the bounded Saathi v1 requirements without broadening into Jira/Rovo parity.

**Recommendation:** keep Compact B, Overview → Board, labelled navigation, existing Radix/shadcn components, CSS tokens, PostgreSQL authority, Supabase identity, and Redis/SSE. Do not start another visual redesign or migrate the whole client state stack. Close the acceptance gaps, keep the last interface changes coherent, and verify rendered behavior at desktop/mobile with real owner/member accounts.

## Review findings

### Confirmed

- The system already has workspace lifecycle, membership/invitations, task planning and permissions, versioned writes, Board paging, comments, activity, archive inspection, and optional reviewed AI primitives. These should be verified, not rebuilt.
- Compact B is the selected direction: reduce chrome and repeated content while preserving labels, touch targets, supported task fields, role rules, and recovery behavior.
- Activity continuation and its retry/scope protections were implemented and verified locally in the October 11 closeout; treat that older audit gap as closed in source, pending fresh integrated checks.
- The October 12 Auth follow-up records a successful local owner/member/outsider journey against authorized QA data. This is useful evidence, but it did not prove live realtime delivery; the mobile toast/list accessibility findings remained open.
- The current worktree contains further UI, reliability, test and documentation changes, but has not had a fresh integrated verification pass. A dirty branch or source-level test is not release evidence.

### Proposals carried forward

- Keep page titles and primary actions visually dominant; use restrained surfaces, visible navigation labels, compact cards, clear status and deadline cues, and no redundant workspace headings.
- Keep search visible and put existing filters behind a labelled disclosure if the current implementation still benefits from it. Show active filters and a clear reset.
- Use the existing task details dialog for deliberate edits and read-only archive inspection. Preserve unsaved drafts across refresh/conflict; require explicit discard only when navigation would actually lose a draft.
- Keep unavailable AI out of the primary path. When enabled, AI remains optional and proposals require review and deterministic confirmation.
- Do not claim “easier than Jira” without observed user evidence.

### Product choices to settle before treating them as requirements

1. **Archived workspace lifecycle:** v1 requires archive and permanent deletion but has no restoration command. Confirm whether restore belongs in v1. Until decided, preserve read-only archive inspection and do not add a restore path.
2. **AI source evidence:** decide whether MVP answers must link to supporting tasks or whether inspectable attention items and reviewed actions are sufficient. Do not expand to connectors, autonomous agents, or persistent chat history.
3. **Activity acceptance:** older activity continuation is implemented locally; decide whether unlimited retained-history traversal is required for v1, consistent with the existing Compact B and product requirements.

These are the only product decisions that materially change remaining product implementation. Everything else below can progress without waiting.

## Design review by surface

| Surface | Assessment and direction | Review states |
|---|---|---|
| Entry and workspace creation | Keep one required workspace name and optional goal/date. AI suggestion is secondary and absent when disabled. | First workspace, existing workspace, validation, busy, service failure retaining input |
| Shell and navigation | Overview, Board, Team remain labelled primary destinations. Activity and owner Settings stay in the workspace menu; help/archive/logout stay in profile. Keep URL/hash and selected view consistent. | No workspace, workspace switch, direct URL/refresh, owner/member, narrow viewport |
| Overview | Make progress and next action scannable; preserve timezone-correct due grouping. Keep quick add title-first. Completed work stays secondary. | Empty, populated, loading, refresh failure, no actionable tasks, date boundaries |
| Board | Let task titles lead. Remove repeated metadata and secondary actions from the default card face only where discoverability remains clear. Preserve direct completion/reopen and all full fields in details. Filters remain available and truthful. | Empty vs no matches, active filters, page loading/error/retry, filtered totals, long title, unknown write result |
| Task details and comments | Reuse the existing dialog. Preserve authorized by-ID opening, owner/member permission split, comments, captured version, and draft through refresh/conflict. | Loading, read error, stale conflict, read-only archived task, comment pending/error/retry |
| Team and invitations | Make roles and invite outcomes plain; email delivery status must not be confused with membership state. | Pending/expired/revoked/wrong identity, provider unavailable, copy-link fallback, long email at 360px |
| Activity and archive | Show Activity directly with older-page continuation, loading/error/retry; archive details remain read-only. | Empty, continuation, failure retry preserving loaded rows, revoked membership, archived scope |
| Feedback/accessibility | Use inline errors for field/action recovery and shared toast for transient global feedback. Every control has name, focus state, busy/disabled behavior and announced result. | Keyboard-only, focus return, toast/focus interaction, reduced motion, 360px overflow |

No new visual system, component framework, generic pagination layer, client cache, AI experience, or archive restore is authorized by this review.

## Implementation sequence

### 0. Reconcile current state and freeze what is in scope

Inspect the current branch diff and recent evidence before changing code. Mark each v1 functional requirement and NFR as implemented/verified, implemented/unverified, missing, or external gate. Review the pending diff for any mismatch with this plan, especially authentication, permissions, reliability behavior, and unintended product surface changes. Keep existing unrelated changes; do not stage, commit, push or deploy.

**Done when:** the current change set and test gaps are classified, existing proof is retained with dates, and only real remaining work is scheduled.

### 1. Close the integrated local correctness gate

Run the smallest complete final local suite against the current tree: type check, lint, unit/component tests, disposable database integration, production build, browser suite and patch hygiene. Confirm fixture cleanup and test isolation. Fix only reproducible failures; preserve expected-version, idempotency, authorization, draft-retention and unknown-outcome semantics.

**Done when:** checks pass with skips and environmental limits recorded, or a precise reproducible blocker is documented. Existing passing historical checks are not rerun unless needed by the integrated gate.

### 2. Finish the Compact B interface from evidence

Use the current implementation as baseline, then review and correct only remaining observable issues across workspace creation, Overview, Board, details/comments, Team and Activity/archive. Use existing controls/tokens and preserve all routes, hashes and task fields. Specifically verify the creation AI panel follows capability state; no stale workspace data flashes on a switch; counts identify whole-workspace versus loaded/filter results; and errors distinguish failed writes from failed follow-up reads.

Run signed-in owner/member checks at desktop and 360px, including keyboard navigation, task completion, search/filter/load-more, editing/conflict recovery, comments, invitation states, Activity continuation and archive read-only details. Resolve the known mobile toast/list accessibility findings and any reproduced Board loading issue. Do not broaden the suite to generic cross-browser support without a requirement.

**Done when:** core journeys have repeatable rendered evidence with no serious/critical axe findings, keyboard blockers, horizontal overflow, misleading state, or known reproducible broken action. Keep user research separate from automated acceptance.

### 3. Validate optional AI as a bounded capability

Use authorized disposable workspace data and a real configured provider. Verify summary/answer behavior against known facts, unsupported questions, attention task IDs, owner/member isolation, outsider denial, malformed/timeout/provider-off cases, rate limits, reviewed task drafts, exactly-once confirmed persistence, and useful recovery. Ensure the feature remains absent when disabled. Implement source links only if the product decision in the review section adopts them.

**Done when:** provider behavior and permission boundaries have recorded evidence; no claim of factual grounding from schema/unit tests alone.

### 4. Close measured scale and realtime requirements

Measure the documented envelope rather than adding speculative caching: 100 distinct authenticated users, <=25 members and <=1000 tasks per workspace, >=15 minutes and >=1000 measured operations/events. Record p50/p95/p99, errors, requests, durable commit-to-observer latency and costs. Check task API p95 <=750 ms, commit-to-observer p95 <=2 s, unexpected failures <1%, revocation <=30 s and healthy reconnect reconciliation <=5 s. If provider limits prevent the run, retain smaller measurements and mark this acceptance blocked by that external limit; do not call connections equivalent to users.

Only change runtime code for a measured failure, then repeat the affected check and regressions. Keep PostgreSQL authoritative and SSE as a reconciliation signal.

**Done when:** targets pass with a reproducible report or each unmet target has a named, evidenced blocker and owner.

### 5. Complete operational and hosted release acceptance

On the selected release environment, verify deployed SHA, readiness, fresh migration path, auth confirmation/OAuth/recovery as configured, invitation email/link journeys, two-user realtime and reconnect, worker scheduling and alerts, preview/production isolation, backup restore, rollback procedure, logs/privacy, and operating cost/owner. Production health must report readiness, not just liveness. Exercise restore only in a disposable environment with owned fixtures.

**Done when:** operational evidence is current and attached to a verified deployed SHA, or release remains explicitly a candidate with unresolved gates. This stage is release acceptance, not authorization to deploy or mutate production.

### 6. Finalize product language and completion ledger

Resolve the three listed scope decisions; update the draft PRD/architecture only where required, preserving historical reports. Report the code, browser, provider, load, deployment and human-use evidence separately. A production-ready label requires all applicable gates; do not compress these unlike dimensions into a completion percentage.

**Done when:** each v1 FR/NFR has a current evidence reference and the release state is accurately named.

## Invariants across every slice

- Server-side authorization on every protected read, mutation, page and subscription; UI visibility is not authorization.
- PostgreSQL remains authoritative. Keep transactions, expected versions, durable receipts, outbox, retry identity and scoped cursors.
- Never silently overwrite or discard a dirty task draft; never blindly retry an uncertain non-idempotent write.
- Existing workspace/task/comment permissions, archive read-only behavior, invitation identity and feature flags remain intact.
- Fixture cleanup touches only fixture-owned records. No production mutation, commit, push or deployment without explicit authorization.
- AI remains optional, authorized, advisory and confirm-before-write.

## Evidence boundaries

- The October 11 gap closeout reports 261/263 registered tests passing with two existing skips, full database files passing, type check/build and 14 public-auth browser checks. This does not certify the current dirty tree.
- The October 12 follow-up reports local owner/member/outsider sign-in, persistence, assignment/completion and outsider denial; realtime was interrupted, and mobile toast/list findings remained.
- Hosted readiness was HTTP 503 in the October 11 report. That is dated evidence; refresh it before any current release claim.
- Sustained 100-user performance, live AI quality, email delivery, reliable realtime recovery, scheduled workers/alerts and backup/restore remain unproven in the cited records.

## Explicitly out of scope

Enterprise workflow builders, hierarchy/subtasks, attachments, reporting suite, cross-workspace AI, autonomous AI writes, durable chat history, drag and drop, a component-library replacement, wholesale TanStack migration, speculative caching, and comparative superiority claims without user research.

## Final verification checklist

- [ ] Scope and archive/AI/activity decisions recorded.
- [x] Current tree type check, lint, unit/component and database suites pass; skips stated in the execution record. New sustained-load verifier has a separate smoke/full-run gate.
- [x] Production build and recorded core browser journeys pass on desktop and 360px.
- [ ] Keyboard, focus, accessibility, invitation and owner/member/outsider boundaries pass.
- [ ] AI provider acceptance passes or AI stays disabled with explicit release scope.
- [ ] Performance/realtime targets pass or unmet items have external blockers.
- [ ] Hosted readiness, deployment identity and operational recovery evidence are current.
- [ ] FR/NFR ledger references current evidence; no stale report is presented as current.
