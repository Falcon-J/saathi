# 6. Mastery lab

[Handbook](README.md) · [Previous](05-requirements-and-operations.md)

These are reasoning exercises first. Reading and sketching require no mutation. Running database/provider/failure probes requires an explicitly approved disposable environment and secure configuration. Do not experiment against a live deployment to learn a concept.

## Part A: reconstruct without looking

Draw browser, application, Auth, PostgreSQL, Redis, outbox worker, SSE, and AI. Mark:

1. Three trust crossings and where input is validated.
2. The transaction that creates a task.
3. The point after which a cache failure must not report “save failed.”
4. The path used when notification delivery is lost.
5. The boundary preventing AI from authorizing a write.

**Self-check:** PostgreSQL owns durable state; Redis owns temporary coordination. The database commit precedes successful acknowledgement. Outbox delivery follows independently; clients reconcile. Human confirmation still invokes ordinary authorization.

## Part B: predict the outcome

| Scenario | Predict before opening the answer |
| --- | --- |
| A | Alice saves version 7; Bob then saves version 7 |
| B | A create commits, response is lost, same command ID is retried |
| C | B's command ID is reused for a different title |
| D | Task is deleted, original create command is retried |
| E | Bob is removed, then retries an old create receipt |
| F | Redis publication succeeds; publisher dies before marking it published |
| G | Task read A starts, newer read B finishes, then A finishes |
| H | User visits W→V→W while first W read is pending |
| I | Exact CSV is retried; then one byte of the file is changed and retried |
| J | A search match is task 101 but the Board silently loads only 100 |
| K | Model returns valid JSON with an unsupported factual claim |
| L | A due date is converted to midnight UTC and displayed west of UTC |

<details>
<summary>Worked answer key</summary>

- **A:** Alice succeeds to version 8; Bob receives a conflict. Inspect `changeTaskRecord` and `matchesTaskVersion`.
- **B:** The receipt returns the original acknowledgement; no duplicate task/create event. Requires same scope, retained ID, matching normalized input, and current authorization.
- **C:** Conflict. Hash/type comparison prevents one ID from representing two commands.
- **D:** No recreation. Receipt is independent of task deletion; its snapshot is historical rather than current task state.
- **E:** Reject access before receipt replay. A receipt is not permanent permission.
- **F:** A later retry may duplicate the notification. Exactly-once delivery is not guaranteed; clients reconcile authoritative state.
- **G:** The older generation must be discarded. A successful HTTP response can still be stale UI data.
- **H:** The first visit's selection identity remains old even though the workspace ID matches again.
- **I:** Exact file rows replay stable receipts. Changed content represents a new import and may duplicate unchanged logical rows. Two equal rows within one file are intentionally separate.
- **J:** Search and counts become incomplete. Server paging must ship with scoped filters and separate aggregates, not a silent limit.
- **K:** Shape validation passes, truth does not follow. Grounding/evaluation is separate; provider output never supplies permission.
- **L:** The user can see the previous calendar date. Preserve date-only semantics rather than invent an instant.

</details>

## Part C: trace source, not folder names

| Assignment | Deliverable | Source checkpoints |
| --- | --- | --- |
| Task create | One-page sequence with transaction contents and uncertain outcome | `handleAddTask` → `addTask` → `createTaskRecord` → receipt/event helpers → `afterDomainCommit` |
| Stale edit | Show where the original editor version reaches the command | `TaskList` editor → hook edit → `changeTaskRecord` → permission/version helpers |
| Member removal | Explain assignment clearing, version increments, and access loss | `removeMemberFromWorkspace` → `removeWorkspaceMember` → SSE recheck → client resync |
| Comments paging | Explain tie-breaking, cursor scope, and page display order | `getTaskComments` → `listTaskCommentsPage` → `TaskComments` |
| Reconnect | Explain expired versus empty-stream cursor behavior | `useRealtime` → route replay status → `getReplayStatus` → authorized refresh |
| AI draft | Prove there is no provider-to-database authorization shortcut | `askWorkspaceAdvisor` → projection/provider/parser → `confirmWorkspaceAdvisorDraft` → domain create |

Use the source links in chapters 1–4. Explain symbols and decisions, not every line. If you cannot identify the actor, lock order, transaction boundary, and failure outcome, reread that flow.

## Part D: select the right verification

For each proposed change, name a test that would fail if your implementation were wrong:

- New assignee option: invalid cross-workspace assignment must fail in DB and action; authorized selection must work in the editor.
- Faster SSE polling: test no overlapping polls, revoked-member delivery checks, idle command counts, and measured event latency/cost.
- Task paging: a match beyond page one remains findable; total counts remain complete; equal timestamps and changed filters do not omit records.
- Receipt expiry: a late retry must not recreate a deleted task. Expiry needs a consumed-ID/tombstone policy before deletion.
- Additional AI capability: malformed response, disabled flag, outsider request, unsafe confirmation, and provider failure must not write data.

Source-string assertions cannot prove these user journeys. DB tests cannot prove a component submits the right version. Pair tests with the boundary they actually establish.

## Capstone: explain the whole incident

Alice edits T, Bob's browser disconnects, his old draft fails, his create acknowledgement is lost, Redis goes down, and Alice removes Bob. Explain the outcome in this order:

1. Verified identity and current membership decide access.
2. Versions reject Bob's stale edit; UI should preserve intent for review.
3. Stable command C and its receipt resolve the uncertain create without duplication.
4. PostgreSQL keeps committed state and outbox obligations despite Redis outage.
5. Recovery may deliver duplicates; authorized reads reconcile the UI.
6. Membership removal clears assignments and increments affected versions.
7. Bob's next command is denied; SSE rechecks on batches/heartbeat/idle interval and closes on denial.
8. No UI rollback, “Live” badge, cached receipt, or AI answer changes the underlying authority.

**Pass criterion:** redraw and narrate this without notes, cite the implementation symbols, and name one limitation per mechanism. This demonstrates architectural reasoning; it does not substitute for a passing acceptance suite.

## Interview and design review prompts

- Why a modular monolith? What measured pressure would justify extracting a service?
- Why both row locks and versions? What becomes a hotspot?
- Why an outbox? Which crash still causes duplication?
- Why SSE? Which product requirement would justify WebSockets?
- Why not authorize from Redis presence? Why not cache membership indefinitely?
- Why keyset paging? What happens when records have identical timestamps?
- Why retain receipts after task deletion? What is the cost/privacy tradeoff?
- What exactly did the 200-connection benchmark establish, and what did it not?
- Which production gate would you refuse to skip, and what evidence would close it?

Strong answers include mechanism, invariant, failure, tradeoff, and evidence. Naming a technology without those five parts is not system-design mastery.
