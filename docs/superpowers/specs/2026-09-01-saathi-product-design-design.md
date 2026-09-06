# Saathi Product and Design Direction

Status: Draft for review
Date: 2026-09-01

## Product thesis

Saathi is an India-first, open-source work-execution product for teams that need to know:

1. What matters now
2. Who owns it
3. What changed

Saathi should not compete with Jira by matching every planning feature. It should win by making collaborative work understandable, fast to start, and easy to keep current.

The first meaningful outcome is:

> A team can migrate, onboard, and complete real work in one afternoon.

## Target users and jobs

### Primary user

- Small Indian product and engineering teams that need a practical collaboration surface

### Core jobs

- Capture and assign work without learning a project-management system
- Move work through a small, understandable set of states
- See what changed and what needs attention

## Product principles

### 1. Fast to first value

The shortest useful path is: create workspace, create board, create task, assign task, move task. Setup should not require project methodology decisions.

### 2. Calm density

Show enough information to make a decision without turning every fact into a card, badge, or notification. Use progressive disclosure for history, permissions, and secondary metadata.

### 3. Realtime without anxiety

Live updates should preserve the user’s place, avoid layout jumps, and explain changes quietly. Realtime is a trust feature, not a visual effect.

### 4. Human-readable by default

Task titles, ownership, status, and next actions should be understandable to a teammate who does not live in issue trackers.

### 5. Reversible work

Moving, assigning, editing, or deleting work should provide undo, recovery, or a clear activity trail wherever technically possible.

### 6. Open-source core, honest product claims

The product must remain self-hostable and inspectable. Marketing and UI copy must describe implemented behavior and measured results, not aspirational uptime or latency.

## Core v1 scope

### Workspace and access

- Account registration and secure session management
- Workspaces with explicit membership and owner permissions
- Invite and remove members
- Clear empty states for a new workspace

### Work execution

- Simple kanban boards
- Tasks with title, status, owner, priority, due date, comments, and activity
- Inline editing for common fields
- Lightweight filtering

### Collaboration

- Realtime task and workspace updates
- Activity history for important task and workspace changes

### Post-core adoption

- One migration path, starting with CSV or the most-used issue tracker
- Documented self-hosting path
- Export that keeps teams in control of their data

## Explicit non-goals for the first core release

- AI agents, AI task generation, and autonomous mutations
- Epics, complex sprint methodology, and advanced portfolio planning
- Custom fields and a generalized workflow builder
- Automation marketplace or broad integration marketplace
- Native mobile application before responsive web usage is understood
- Recreating every Jira permission, report, or configuration surface

AI may later summarize activity, propose conflict resolutions, or help migrate work. It must not become the authority for identity, access, mutation success, or persisted state.

## Information architecture

The board is the authenticated home. It should answer “what needs attention?” without becoming a wall of metrics.

### Board

- Four or fewer default states
- Task cards show title, owner, priority, due date, and a small activity signal
- Secondary metadata appears on selection or expansion
- Add-task action is available in context

### Supporting panels

- Activity drawer for changes, comments, assignments, and invites
- Team panel for members, roles, and invite action
- No separate inbox or reporting surface until usage proves it is needed

## Design language

The design language is a calm, board-first workspace: operational clarity without the visual weight of a command center. It uses a premium light system that is practical for daily work, with Saathi's original identity kept visible but restrained.

### Visual foundations

- Warm neutral canvas `#F5F5F7`, white primary surfaces, graphite text `#1D1D1F`, and subtle `#D2D2D7` borders
- Blue `#007AFF` is the primary-action colour; Saathi green `#34C759` communicates live and successful states; amber communicates attention; red is reserved for destructive/error actions
- An 8px spacing rhythm: 4-8px for dense controls, 12-24px for components, and 32-64px for page layout
- 4px radius for labels, 6px for controls, 8px for cards and panels, 12px for board containers; raised elevation only for task cards and overlays
- Restrained in-app typography with readable headings and labels; no landing-page display type inside the workspace
- The logo is a bespoke, small SVG “shared path” mark: two distinct routes meeting and crossing once before opening forward. It must not be a stock mark, four-tile diamond, generic infinity loop, or AI-generated raster. A trademark-availability check remains a release gate.

### Interaction foundations

- Every screen has one primary action
- Common edits happen inline or in a nearby popover
- Loading, offline, error, and realtime states are explicit
- Keyboard navigation, visible focus, mobile usability, and recovery are first-class requirements

### Content foundations

- Prefer “Assign to Priya” over “Manage assignee”
- Prefer “3 changes since you were away” over a raw event count
- Never use fake latency, uptime, or readiness figures
- India should appear through thoughtful copy such as “Built in India for teams that move fast,” not visual clichés

## Visual suite and route coverage

The suite reuses one token system and a small set of component patterns. It deliberately does not add a UI framework, new backend concepts, or decorative marketing pages.

| Surface | Design outcome | Preserved behavior |
| --- | --- | --- |
| Landing (`/`) | Concise hero, one primary CTA, one board preview, and a restrained benefit row | Existing sign-in and registration navigation |
| Authentication (`/login`, `/register`) | A focused light form, optional desktop-only product preview, inline validation/recovery area | Existing login, signup, session, and redirect contracts |
| Workspace dashboard (`/dashboard`) | Compact shell; board dominates; Team and Activity remain secondary | Workspace switching, membership, invitations, realtime state, task actions |
| Task editing | Clear task editor with title, metadata, assignee, save state, and destructive confirmation | Existing task CRUD and optimistic/recovery behavior |
| Workspace and membership | Inline workspace naming, clear owner/member roles, explicit invite form | Existing authorization and invite/remove contracts |
| Empty, offline, and mobile states | One-action empty state, inline retry banner, mobile board tabs and touch targets | Existing data loading, reconnect, and task creation behavior |
| Legacy task route (`/tasks`) | Use the shared tokens and task primitives as a compatibility view; do not create a competing visual system | Existing route and task contracts |

## Interaction and feedback rules

- Every screen has one obvious primary action.
- Mutation feedback appears once: inline near the relevant form/state for recoverable errors and confirmation, or as one themed toast only when the user has navigated away from the affected surface.
- Realtime/offline information is a slim inline banner. It never obscures task controls or stacks with other messages.
- Destructive actions are red, explain consequences, and require confirmation. Successful saves are quiet and local to the action.
- Team membership is context, not the primary work surface. The board always retains the most space.
- Desktop uses a compact navigation rail; mobile collapses navigation and uses status tabs rather than squeezing desktop columns into a small viewport.

## Realtime and conflict behavior

The authoritative source for persisted state remains the server-side workspace and task data. Redis Streams carry ordered change events; the browser consumes them to refresh or reconcile visible state.

The first conflict behavior is deliberately small: detect a changed server version, preserve the user’s draft, and show a clear retry or overwrite choice. Add field-level merge UI only after a real concurrent-edit case justifies it.

An eventual AI assistant may summarize the difference, but the final choice and mutation remain deterministic and user-controlled.

## India-first product requirements

- Responsive web experience that remains usable on smaller screens
- Efficient initial loads and restrained realtime payloads
- Localization-ready patterns and a self-hosting path suitable for small teams

These are product constraints, not reasons to add speculative integrations before the core loop is reliable.

## Security and operational requirements

- Passwords must be hashed using a modern password-hashing algorithm
- Every workspace read, subscription, and mutation must enforce authenticated membership
- Mutations must define idempotency and failure behavior before retries are added
- State transitions and event publication must not report success before persistence is authoritative
- Production Redis mode and development mock mode must be clearly separated
- Logs and metrics must avoid secrets and unnecessary personal data
- Backups, retention, error alarms, and deployment recovery need documented ownership before a production readiness claim

## Success measures

### Activation

- Time from registration to first created task
- Percentage of new workspaces that add a second member

### Adoption

- Weekly active workspaces
- Completed tasks per active workspace

### Experience

- p95 time for core task actions to show authoritative success
- p95 realtime event delivery measured by the authenticated benchmark

### Product outcome

- A representative team can import existing work, invite teammates, and complete real work in one afternoon without operator assistance.

## Implementation sequence

1. Establish semantic Saathi tokens, the original SVG mark, app shell primitives, and shared feedback states.
2. Apply the system to landing and authentication before changing authenticated flows.
3. Refactor the dashboard shell and board hierarchy, then task editing and workspace/membership surfaces.
4. Apply empty, offline, conflict, and mobile states; bring `/tasks` onto the shared visual primitives without breaking its route contract.
5. Validate focused interactions, type checks, production build, desktop/mobile browser flows, and a visual comparison against the approved suite.

## Acceptance criteria for the next UI slice

- A new user can create and assign a task without reading a tutorial.
- Landing, authentication, workspace, and compatibility task surfaces share the same light tokens, bespoke logo, and interaction language.
- Realtime updates preserve the user’s place and do not create duplicate cards or lose drafts.
