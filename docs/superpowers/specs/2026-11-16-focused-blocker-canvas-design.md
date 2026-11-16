# Focused blocker canvas

Approved by the user after reviewing the interactive preview in this chat.

When a task is selected, the graph shows that task and its unfinished direct prerequisites. Completed prerequisites, ancestors of those prerequisites, downstream work and unrelated tasks are excluded. Selecting a blocker moves focus to that task; authoritative completion/reopening recomputes the graph. Keep the existing bounded rendering contract and disclose overflow only when actual blockers exceed it. Workspace browsing and authorized search remain available.

The task inspector has All tasks, title, readiness with blocker count, description, populated assignee/due fields, Edit task/Details and permitted Mark done. Remove the default duplicate blocker/dependent lists and the tools picker while inspecting. Task details retains empty metadata and prerequisite inspection/editing with existing permission, version, recovery and accessibility contracts. A completed task with unfinished prerequisites still displays Review.

Use the existing React Flow renderer, camera, task editor and domain operations. The parent workspace remains a structural grouping, without its card/header in task focus. Avoid new dependencies, account/access changes and hidden domain state. Mobile remains readable and keyboard accessible.

Approach: implement the approved focused graph and compact inspector directly in existing components. A separate graph renderer would duplicate camera and accessibility behavior; a CSS-only change would leave unwanted nodes present. No deployment, push or hosted preview before the user reviews the working local UI.
