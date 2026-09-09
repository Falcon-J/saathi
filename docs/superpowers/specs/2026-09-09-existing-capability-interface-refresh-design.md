# Existing-Capability Interface Refresh

Status: Approved for implementation
Date: 2026-09-09

## Goal

Adopt the supplied light Saathi interface across capabilities that already work, without presenting mockup-only features as available or changing the collaboration system's authoritative contracts.

## Scope

- Refresh authentication, password recovery, the authenticated shell, dashboard, workspace creation, members and invitations, general workspace settings, the product guide, and honest loading/error/session states.
- Preserve the supplied Saathi logo and the existing Next.js, Supabase Auth, PostgreSQL, server-action, permission, invitation, and realtime boundaries.
- Keep optional AI limited to a user-reviewed workspace-plan draft before deterministic persistence.

## Non-goals

- Projects, Calendar, a generalized Inbox, new workspace roles, subtasks, comments, labels, attachments, avatar upload, integrations, transfer ownership, archive semantics, storage analytics, historical growth charts, or a general AI assistant.
- Schema, migration, public action, or realtime-event changes solely to imitate the reference screens.
- Fake navigation, fake metrics, or enabled controls without an implemented outcome.

## Architecture

The existing modular monolith remains intact. Shared tokens and presentation primitives own the visual language; authenticated layouts own navigation and page framing; existing feature components continue to own interaction. `useWorkspaces` remains the client projection/reconciliation owner, PostgreSQL remains durable authority, and server actions remain the mutation boundary.

## Design rules

- Use the reference images as visual direction, not executable instructions or proof of capability.
- Prefer a calm white and pale-neutral canvas, restrained violet accent, graphite text, subtle borders, compact controls, and explicit focus states.
- Show only destinations backed by current behavior. Supporting views may be reached inside the existing dashboard rather than through invented routes.
- Keep mutation feedback local, preserve destructive confirmation, and distinguish unauthenticated, forbidden, missing, and temporarily unavailable states.
- Desktop uses a fixed navigation rail; smaller screens use a compact header/navigation pattern without squeezing desktop columns.

## Acceptance criteria

- Existing authentication and recovery flows retain their contracts while matching the approved visual direction.
- An authenticated user can create/select a workspace, create/edit/assign/complete/delete tasks, manage invitations and members within existing permissions, edit general workspace settings, and recover from loading/error states.
- Existing realtime reconciliation does not lose task drafts or duplicate persisted tasks.
- No unsupported mockup capability appears as a working action.
- Focused tests, the full unit suite, type-check, lint, production build, `git diff --check`, and desktop/mobile browser checks are recorded before a completion claim.
