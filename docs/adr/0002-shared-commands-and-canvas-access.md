# ADR 0002: Shared commands and canvas access

- Status: Accepted
- Date: 2026-11-13

## Decision

Keep one application and the persistence boundaries in ADR 0001. React Flow renders authorized records; its camera and layout are presentation state. The command bar supports deterministic human actions without a model. External MCP clients use the same domain operations and may supply their own models.

Company, space, section and workspace resources have one canonical containment path. References do not grant access. Workspace membership remains mandatory; inherited or explicit section capabilities only narrow existing task and owner permissions. A restricted section resets inheritance. Management does not bypass a restricted descendant. Queries, writes, event delivery and tools enforce the same policy.

MCP verifies a dedicated OAuth audience, an allowlisted client, the current user and a revocable application delegation on every request. Provider identity scopes are separate from application capabilities. Security and destructive permissions require explicit consent. Browser sessions cannot authenticate MCP requests, and agents cannot approve their own work.

Mutations use stable command identifiers, version checks and durable receipts. Domain writes, activity and outbox entries share an outer transaction; nested operations use savepoints. Replay rechecks current permissions, filters private results and identifies the response as historical. An uncertain transport outcome never means a mutation failed.

Agent coordination records finite leases and fencing tokens. Progress and evidence are reported facts, not proof of completion. A human review checks current permissions and task version before completing work. Cancellation blocks future coordinator writes; it does not claim to stop an external process.

## Consequences

- Reuse existing accessible controls, task editors, comments, readiness calculations and realtime recovery.
- Keep the MCP adapter thin; do not build a hosted agent runtime or custom animation engine.
- Keep camera movement opt-in for agent following. Manual navigation stops following.
- Test permission changes, receipt retries, lease expiry and stale writes in real PostgreSQL, alongside browser and performance acceptance.
- Activate hosted OAuth only after real-client consent, refresh and revocation have been verified. Keep MCP disabled until configured.
