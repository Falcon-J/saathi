# Canvas core and command bar direction

Date: 2026-11-12. Design discussion; no application or database changes.

## Confirmed requirements

- Replace the earlier Work-first / Conversation-first sketches with a continuous canvas experience.
- Existing workspaces and tasks become blocks that reveal useful detail as a person focuses or zooms into them.
- Keep a prominent bottom command bar available across overview and focused work.
- People must be able to find, create, edit, and complete work without an AI provider.
- Include section-level read/write access in the intended permission model. Existing workspace membership does not implement arbitrary section access.
- Design shared structured actions/context so AI can use the same platform later with less integration overhead.

The UI proposals in the earlier architecture audit and the two home-screen sketches are superseded by this canvas direction. The existing-stack recommendation remains applicable, but company grouping, canvas sections, and access boundaries expand the earlier proposed scope. The following interaction and policy details are recommendations for review.

## Command bar without AI

One input, with the current scope visible: selected task, workspace, section, or company. Selection changes context but never silently changes permissions. When nothing is selected, use the visible canvas scope rather than an undisclosed global scope.

- Start typing to find authorized tasks, workspaces, and people. Results identify the containing workspace and open the matching block in context.
- Offer deterministic actions such as Create task, Mark done, Change assignee, Edit details, and Link prerequisite. A slash or keyboard shortcut may filter actions, but commands must also be discoverable by visible controls.
- Choosing an action opens a small structured form or preview near the bar. The canvas remains visible. Known direct actions do not need a conversational exchange.
- Show only actions allowed for the selected scope, and enforce permissions again on the server. A disabled/unavailable action must not be offered as a working operation.
- Plain search does not silently become a mutation. An ambiguous selection asks which record the person means.
- Enter opens the selected result or executes an explicitly selected action. Escape closes the current search/action surface and returns focus; it does not undo or cancel an already committed operation.
- Show pending, confirmed, conflict, and unconfirmed outcomes distinctly. Retain command identity through uncertain responses; do not repeat a mutation as a new command.
- A successful search locates/focuses the block; returning to the overview restores orientation. Supply keyboard navigation, zoom controls, and an accessible structured list alternative to wheel/pointer-only operation.

Keep model selection in assistant settings unless an actual user decision requires it. Voice is an optional input path, not a requirement for using the core. The bar must remain usable around the mobile keyboard and must not cover the active task controls.

## The same bar with AI

Use an explicit Ask/Plan action for natural-language interpretation rather than spending a model call on every keystroke. Search, counts, readiness, filtering, and well-defined commands remain deterministic.

The model receives a bounded authorized projection of the selected scope, relevant records, dependency facts, versions, and available commands. It proposes structured actions; application code resolves authorization and persistence. Do not ask the model to interpret screenshots, node coordinates, or every task in the company.

Examples:

| Request | Core behavior | AI contribution |
| --- | --- | --- |
| Find a named task | Authorized search and canvas focus | Optional interpretation of vague wording |
| Mark the selected task done | Explicit version-checked command | None required |
| What is blocking this task? | Compute prerequisites and status | Optional concise explanation |
| Turn this outcome into a plan | Reviewable task/dependency proposal | Draft the proposed work |
| Update several tasks from this note | Show affected records and a change preview | Interpret the note and propose a change set |

Preview AI-proposed writes before applying them in the initial version. Revalidate permission and expected versions at approval time. Later unattended execution needs an explicit scoped, expiring, revocable delegation; it does not follow automatically from having an assistant.

When AI fails or is disabled, search and direct commands remain available with their normal behavior. A model response is not evidence that a command committed. Chat history is not the source of truth for work.

## MCP-first integration recommendation

Prefer a provider-independent core plus an authenticated MCP server before expanding the bundled assistant. This is a recommendation under discussion, not an implemented integration or a decision to remove the existing optional Groq capability.

Compatible external AI clients can obtain authorized context and invoke Saathi commands. The external client supplies the model and conversation runtime. Deterministic Saathi tools do not require Saathi to pay for model inference, but hosting, database, realtime, authorization, and tool traffic remain operating costs. Client support, transport, and authorization compatibility must be tested; MCP is not automatic connectivity to every model or AI product.

A small MCP server using an official SDK can be less work than operating a full embedded assistant. A production multi-user write server is not automatically simpler than the current bounded advisor: delegated authorization, permissions, retries, conflicts, revocation, attribution, and client compatibility still need engineering. The maintainability benefit comes from thin adapters over shared application commands, not from putting new business logic in MCP tools.

Expose a bounded context/search read first, then one explicit retryable write. Add task claims and reported run progress for parallel execution. Record server-observed intent/results and explicitly reported progress; MCP alone cannot reveal an external agent's private reasoning or unrelated actions. If AI remains entirely external, the in-app command bar stays deterministic; an in-app natural-language conversation/voice assistant requires a separate model/client integration.

References: [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture), [server guide](https://modelcontextprotocol.io/docs/develop/build-server), [HTTP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization).

## Shared component and command boundaries

1. Canvas shell: viewport, focus, selection, accessible navigation, and restoration of orientation.
2. Entity blocks: workspace/task representations backed by canonical records.
3. Command bar: scope, authorized search, action picker, structured inputs, and outcome status.
4. Application commands/queries: shared validation, current authorization, versions, receipts, and transactional changes.
5. Assistant adapter: bounded context and structured proposals over those same contracts.
6. Permission resolver: effective capabilities shared by reads, writes, search, realtime, and future agent tools.

Store canvas arrangement separately from work records. Camera/selection preferences are personal UI state; shared block placement is a distinct collaborative concern. Moving a block must not reassign a task, move its authorization boundary, or alter a dependency.

## Section access proposal

Retain workspace permissions while defining the new container model. A section must be an explicit server-recognized resource with an access policy, not merely a rectangle hiding unauthorized content.

Prefer two understandable section modes: inherit access from the containing space, or restrict access to an explicit set of members/groups. Effective read/edit/manage capabilities must respect that boundary and the existing task/domain rules. Do not introduce an unlimited hierarchy of per-field overrides.

Define organization membership, resource ownership, and section sharing separately. A company-level canvas is not automatic permission to read every workspace. Sharing a section must state which contained resources it grants access to; placing a shortcut to an existing private workspace must not silently share that workspace. This grant-versus-reference distinction must be resolved before a schema migration.

Unauthorized sections and their connection metadata must not leak through overview counts, search suggestions, tool context, cached projections, or realtime payloads. If a viewer can see only one endpoint, omit the other endpoint's identity/details. Authorize cross-workspace relationships separately: the current dependency contract deliberately forbids cross-workspace task edges.

## Live agent actions

Confirmed direction: make agent actions visible and understandable on the canvas while retaining fast execution. The following behavior is proposed, not implemented.

- Represent each operation as intended change -> pending execution -> committed, rejected, conflicted, or unconfirmed. A review requirement precedes execution when policy requires it. Do not display a proposed or optimistic edit as confirmed persistence.
- Mark the affected block with the acting agent and a concise action label. After commitment, highlight the changed fields and show the resulting state. Preserve a durable, attributable activity record; do not expose hidden model reasoning or fabricate intermediate steps.
- Let the backend execute independently of animation timing. Present meaningful action groups at a readable pace; coalesce bursts and avoid a toast, camera jump, or animation for every low-level event.
- Keep the camera under human control. Offer Follow agent to focus visible activity; manual navigation ends following. Normal agent activity must not steal focus or interrupt editing. Use an activity queue for off-screen changes.
- Distinguish Stop following from Cancel execution. Stopping the visual follow does not stop work. Cancellation is best effort until acknowledged and does not reverse an already committed change.
- Support reduced motion, keyboard navigation, and text status. Reconnection restores authoritative state and available history rather than replaying old animations as new work.
- Apply the viewer's current access to action intent, progress, changed fields, and history. Live activity must not reveal inaccessible sections or agent context.

Prototype one task creation or explicit status update: visible pending action, confirmed field change, dependent readiness update, and a compact activity entry. Test concurrent human editing, conflict, unknown response, cancellation races, event bursts, revoked access, and model-disabled manual behavior.

## First prototype and acceptance

Prototype one existing workspace block expanding into its task canvas, then a task expanding into its working area. Keep the same command bar and inspectable scope at each level. Add component-level interaction sketches before another full-screen visual composition.

Verify the complete manual flow first: locate a task, focus it, edit it, create another task, link a prerequisite, complete work, handle a conflict, and return to the overview. Then show the same operations as reviewed assistant proposals.

Access acceptance must include read-only and editable sections, restricted descendants, private workspace references, two-endpoint connection visibility, revoked access, account/cache isolation, and server rejection of direct unauthorized calls. AI acceptance must include unauthorized targets, invented references, stale proposals, unknown outcomes, and provider-disabled fallback.

Decisions still open: company/space/section terminology and nesting; whether shared layout is manually arranged or automatically organized by default; the precise sharing semantics when resources appear in multiple sections; command bar placement and behavior at narrow widths. No final UI, migration, or implementation approval is implied by this discussion note.
