# Simpler Canvas home

Approved direction: the interactive Canvas + task-panel preview accepted in chat. Canvas becomes the signed-in home, with one task panel and one global Ask Saathi entry. Keep React Flow for dependencies, selected-work context, navigation and saved camera state.

Use existing React/Next.js/React Flow and domain operations. Preserve all capabilities, current authorization, explicit AI confirmation, comments, task versions, receipt recovery, browser history, drafts and mobile access. No dependency additions or database changes. Keep legacy dashboard URLs compatible, but stop presenting Dashboard as a competing destination.

The main task panel has All, Ready, Waiting, Done and Review filters, one bounded list, and a selected-task summary linking prerequisites and dependents. Advanced editing and quick creation reuse the existing task editor and recovery state. Dependency editing stays available contextually through the existing durable prerequisite component. Team, agents, history, settings and import remain secondary actions.

Selecting a graph node inspects it. Explicit Edit opens the existing editor. Search and old editor URLs retain their editor behavior. Add `work` as the canonical inspection/task-panel URL view; continue accepting old ready/tasks/prerequisites links. AI occupies the same work panel through the sole header Ask Saathi entry; workspace-plan help remains inside workspace creation.

Focused graphs show dependency-ordered task nodes instead of hiding every edge in dense workspaces. Bound visible task nodes to 40, always retain the selected task, and expose an honest overflow count. Related work filters to upstream/downstream work; unrelated records remain searchable in the full authorized graph. Workspace/company overview stays collapsed. Positions remain presentation state; no drag-to-mutate or permissions-by-layout.

Desktop shows map plus a narrow work panel. Mobile stacks the map and panel without unmounting the camera. Header search replaces the oversized bottom dock. Reuse semantic theme tokens and accessible controls; no taglines or duplicated labels.

Alternatives considered: retain independent board/overview tools (duplicates the work surface); replace React Flow with a list (loses dependency context); chosen approach consolidates visible work while preserving the existing backend and recovery mechanisms.

Verify full core/platform tests, type/lint/build, targeted graph and navigation regressions, desktop/mobile browser behavior and an independent source review. Record any compatibility or scope ruling in the implementation ledger.
