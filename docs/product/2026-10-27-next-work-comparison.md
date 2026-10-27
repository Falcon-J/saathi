# One-feature comparison: finding the next piece of work

Date: 27 October 2026. This is a documentation-based comparison and repository inspection. Miro redirected the browser to sign-up and ClickUp to login; no authenticated comparative test, timings or user observations were obtained. Saathi's proposed dependency feature does not yet exist.

## Scenario

Five tasks: A Define login, B Build API, C Connect frontend, D Test mobile, E Release. B follows A; C follows B; D follows C; E follows D. A and B are complete, C is open and unassigned, D and E are open. Someone needs to identify C as the next ready task and understand why D and E cannot start. Reopening B should cause C to cease being ready. All data in a live study must be disposable and all users authorized.

## Comparison, based on published documentation

| Step | Miro + Jira | ClickUp | Current Saathi | Proposed Saathi |
| --- | --- | --- | --- | --- |
| Capture five tasks | Jira cards can be used on Miro Planner; changes sync with Jira. [Planner](https://help.miro.com/hc/en-us/articles/10648975837970-Planner-for-Jira) | Whiteboards support creating or editing tasks and converting text and shapes to tasks. [Whiteboards](https://help.clickup.com/hc/en-us/articles/6326615000471-Intro-to-Whiteboards) | Existing task creation. | Reuse existing task creation. |
| Link dependencies | Visual dependency layer between Jira cards, draft or synced. [Miro](https://help.miro.com/hc/en-us/articles/10649083010834-Dependencies-for-Jira); feature is documented for Business/Enterprise desktop. | Gantt supports task dependency links. Whiteboard connectors exist; their equivalence to actual dependency records is not established by the consulted whiteboard documentation. [Gantt](https://help.clickup.com/hc/en-us/articles/6310249474967-Create-and-share-a-Gantt-view) | No dependency model or canvas found in inspected task schema/contract. | Explicit same-workspace dependency links, with users confirming any AI-proposed links. |
| Complete B; find C ready | Documentation establishes dependency mapping and Jira synchronization; automatic ready highlighting in this exact scenario was not established. | Dependencies and waiting/blocking behavior documented; automatic next-ready presentation on a whiteboard was not established in this review. | No dependency-based readiness. | Deterministically derive readiness from confirmed prerequisites and task state, and expose its evidence. |
| Navigate to relevant work | Planner supports Jira card interactions; an independently usable priority-first navigator was not established by reviewed docs. | Whiteboards Hub and AI Command Bar provide whiteboard search; whether the exact evidence-ranked route is available was not established. | Overview opens tasks; AI attention output is textual and its selected reasons are checked against authorized task facts. | One attention list with a direct action to the authoritative task; optional canvas later. |
| Return later | Synced cards exist; save and restore of this exact five-task context not tested. | Saved Whiteboard exists; this exact context and permissions not tested. | Persistent workspace/tasks; no canvas or saved graph view found. | Read canonical task/dependency state and recalculate. Saved canvas view is not required to test this feature. |

Asana also documents [rules that act when dependencies change](https://help.asana.com/s/article/use-dependencies-to-kick-work-off-at-the-right-time), so neither dependency graphs nor automatic next work is a novel category. There is no evidence here that any product is easier or that the proposed feature is unique.

## Candidate: explainable next work

One workspace-scoped feature answers: **What can move next, what cannot, and why?** It is useful without a canvas. Start with a simple five-task scenario and explicit prerequisite links. Treat unassigned as a separate reason for human attention; a task can be dependency-ready while still unassigned. Define behavior for no prerequisites, already complete, multiple prerequisites, reopened prerequisite, missing or unauthorized tasks, cycles, and concurrent updates before implementation.

The core algorithm derives readiness from authoritative task state and confirmed edges. For a task that is not done, all its existing confirmed prerequisite tasks must be done; show each prerequisite as the reason, and show unassigned separately. Tasks without prerequisites are eligible as ready under this proposed definition, not automatically the most important. Ordering is a separate explicit product policy, using due date where present and a stable tie-breaker; never infer importance from completion status or fabricate a deadline. Distinguish an intentionally empty prerequisite set from links that failed to load; an incomplete graph must not be represented as ready.

Preserve current membership checks and task update/optimistic concurrency behavior. Enforce workspace isolation and cycle constraints at the authoritative write boundary. Read a consistent task and edge state; when current truth cannot be obtained, show stale or unavailable instead of a confident answer. The initial version can calculate on request; do not add background infrastructure without a measured need. AI may explain derived facts or propose links; it must not determine authorization, invent blockers, or silently mutate tasks.

## Evidence required

With signed-in authorized test accounts and a suitable test workspace, execute the same five-task scenario against Miro/Jira, ClickUp and Saathi. Record plan and configuration, each action, completion status, time, errors, recovery, and whether the tool actually shows C as ready and explains why. Do not create or alter other users' production data. Until then, unknown means unknown, not a competitive gap.

With representative small teams, measure correct identification of C, explanation and action, false-ready/false-blocked cases, number of steps, and success after B is reopened; compare familiarity and setup. Success thresholds and sample size must be selected before claiming user impact. Existing hosted AI error and performance gate remain unresolved; no product code, deployment, or database migration is included in this comparison.
