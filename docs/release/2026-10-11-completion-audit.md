# Saathi completion audit — 2026-10-11

## Verdict

Saathi is a substantially implemented release candidate. Completion against the documented v1 acceptance and operational requirements is not established. The newly clarified AI objective is a bounded Rovo-inspired MVP; broad Atlassian platform parity is not assumed.

Source inspected: `feature/saathi-interface-refresh`, HEAD `9da6551`, including current uncommitted changes. Those changes are part of this assessment, not proof of deployed behavior. No application changes, commit, push, deployment or hosted-data mutation were performed for this audit.

## Method and evidence

Compared `docs/product/saathi-v1-product-requirements.md`, current implementation and dated release records. The PRD remains marked draft, and the project map uses a different FR numbering scheme; this report uses the PRD's FR-1–7. Later evidence supersedes earlier limits only in its stated scope. Historical provider checks are not fresh production verification.

Fresh checks on October 11: `npm test` passed 254 of 256 tests, with zero failures and two integration skips; `npm run type-check -- --incremental false` passed. The October 11 Playwright rerun did not reach test execution: only local web-server startup warnings appeared, and the stalled run was interrupted. Its startup cause was not diagnosed. The historical 14-pass result remains dated evidence, not a fresh pass. Database integration, a new production build, hosted provider acceptance and production configuration were not rerun in this audit.

## Requirement assessment

| Requirement | Implementation and evidence | Completion assessment |
| --- | --- | --- |
| FR-1 Identity and access | Server-session actor and membership checks in actions/data; prior database and owner/member browser checks; public auth browser suite | Implemented; current full auth, outsider and revocation browser acceptance still unverified |
| FR-2 Workspace lifecycle | Atomic creation, metadata versions, transfer, archive and deletion in `lib/data/workspaces.ts`; prior transfer/archive browser evidence | Implemented with a policy ambiguity: archived deletion is rejected and restoration absent. Decide intended archived lifecycle before treating either as required work |
| FR-3 Invitations | Normalized email, expiry, invited identity, idempotent acceptance and copy-link fallback in `lib/data/invitations.ts` | Implemented; full negative journeys and actual email/webhook delivery acceptance open |
| FR-4 Tasks | Planning fields, validated assignment, permissions, expected-version conflicts, command receipts and 50-task Board pages | Substantially implemented with prior persistence/conflict/paging browser evidence; repeatable current signed-in acceptance incomplete |
| FR-5 Comments and history | Immutable comments with older-comment paging; durable activity records | Durable activity implemented; later Compact B history-browsing requirement incomplete: `lib/data/activity.ts` returns 50 by default, at most 100, with no cursor. `components/activity-history.tsx` has no older-history continuation. Persistence exists; full history retrieval does not |
| FR-6 Daily work | Overview/Board/Team, search/filter/detail, loading/error/archive states; prior mobile Board evidence | Substantially implemented; current signed-in mobile/keyboard/failure journeys and proposed interaction policies need acceptance. Approved Overview-first direction refines draft Board-home wording |
| FR-7 AI | Summary, attention, workspace questions, reviewed task drafts and goal-to-plan flow; server-only provider, membership, schema, rate limit and metadata controls | Implemented foundation; live provider, grounding, isolation and confirm-once browser acceptance unverified |
| NFR-1 Consistency | Transactional facts/outbox, receipts, version checks and client reconciliation; prior integration and real Redis samples | Strong local evidence; full browser missed-event/reconnect and formal sustained acceptance remain open |
| NFR-2 Security/privacy | Server identity, transactional checks, browser domain-table restrictions, metadata-only AI logging design | Implemented controls; deployed settings/log review and full negative acceptance unverified |
| NFR-3 Usability/accessibility | Public auth axe/keyboard/mobile checks; prior signed-in mobile checks | Partial product coverage; public auth evidence does not certify the whole dashboard |
| NFR-4 Performance/operations | Bounded Board/comments, rate limits, retry/retention functions and health endpoints | Incomplete operational acceptance: scheduled workers, alerts, backup ownership/restore and deployed runtime evidence remain open |

Overview still loads its full task projection. This is an unmeasured scaling risk to evaluate at representative sizes, not an established requirement failure.

## Evidence reconciled

- October 4 core records include member discussion, ownership transfer, archived read-only access, CSV persistence, deadline editing and a reproduced stale-edit conflict fixed and retested. These are existing evidence, not absent work.
- October 5 paging evidence supersedes the earlier statement that Board pagination was only planned. It traversed 137 tasks, searched outside the first page, and verified totals and member controls.
- October 5 performance follow-up supersedes the earlier distinct-user sample of 2,739 ms delivery p95. Its final 20-user/100-connection sample delivered 500/500 events, with synthetic delivery p95 1,007 ms, startup p95 3,245 ms and reconnect p95 3,388 ms. It does not establish the required 100 distinct users, 15 minutes/at least 1,000 measured operations, or durable commit-to-observer target. No approved startup budget was identified.
- October 6 UI evidence records 254 passing local tests, two skips and 14 public-auth browser checks. It explicitly leaves current isolated signed-in journeys open.
- September operational readiness records are dated provider snapshots. Backup/restore, worker scheduling, email delivery, preview separation, alerts and latest deployed SHA need current evidence before release acceptance.

## Rovo-inspired AI scope

User clarification on October 11: AI is intended as an MVP inspired by Atlassian Rovo. A proposed bounded MVP scope is authorized workspace knowledge, questions/summaries/attention, inspectable supporting tasks, and explicitly reviewed deterministic actions. Source inspectability needs a product decision; the current attention UI shows reasons without task links. Saathi already has most of these primitives; answer citations/source references and conversational follow-up context are absent. Whether either is mandatory needs a scope decision. Persistent conversation history is explicitly deferred in current requirements.

Rovo's Search, Chat and Agents span connected organizational knowledge and tools: [official overview](https://support.atlassian.com/rovo/docs/what-is-rovo/), [Search](https://support.atlassian.com/rovo/docs/search/), [Chat actions](https://support.atlassian.com/rovo/docs/chat-actions/). These provide a comparison, not authority to add connectors, agent builders, autonomous workflows or cross-workspace access to Saathi.

AI acceptance must exercise a real provider on authorized disposable data: summary correctness, unsupported-answer behavior, attention task identity, member/outsider isolation, malformed output, provider timeout, disabled mode, rate limiting, draft review, single confirmed persistence and error/retry behavior. Unit checks cannot establish factual grounding or provider quality.

## Prioritized completion work

1. Freeze the bounded MVP acceptance scope: clarify Rovo-inspired AI evidence/source expectations and archived lifecycle; retain existing exclusions unless explicitly changed.
2. Execute current signed-in owner/member/outsider acceptance on disposable fixtures, including invitation negative cases, mobile/keyboard, conflicts and missed-event recovery. Fix observed defects before adding features.
3. Validate the real AI provider and reviewed action path against a small known-answer dataset. Add source references only if adopted as part of the MVP scope.
4. Implement Activity continuation if complete historical access is in the accepted scope; preserve scoped cursors and archived reads. The broader Compact B design explicitly requests older records.
5. Complete formal performance and release operations: sustained workload, durable timings, worker scheduling/alerts, controlled email acceptance, backup/restore and current deployment proof.

Study can follow this audit immediately for implemented architecture, but describe the product honestly as a release candidate with acceptance gates open. A completion percentage would imply precision the unresolved scope and evidence do not support.
