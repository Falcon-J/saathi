# MCP activation

Saathi exposes its domain operations at `/mcp`. It uses Supabase OAuth for identity and a separate PostgreSQL application delegation for permissions and workspace restrictions. OAuth scopes such as `email` and `openid` do not authorize task or workspace operations. Cookie sessions are used only by the browser consent and connection pages.

## Deployment configuration

1. Apply the checked-in SQL migrations in order, including `0011_platform_access_and_receipts`, `0012_agent_coordination` and `0013_canvas_access`. Fresh local/CI databases use `npm run db:migrate`. The existing hosted Saathi database uses Supabase migration history and has no Drizzle journal: preserve that history and append these three reviewed files through Supabase migrations. Do not run the hosted Drizzle migrator or invent a baseline. Verify the target schema/history and migration hashes first. Do not run the hook artifact as a schema migration.
2. Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS app origin and retain the existing Supabase URL/publishable key configuration. Configure `MCP_RESOURCE_URL` to the exact canonical HTTPS `/mcp` URL, or allow it to derive from `NEXT_PUBLIC_APP_URL`. `MCP_AUTHORIZATION_SERVER_URL` defaults to the Supabase URL plus `/auth/v1`.
3. In Supabase Authentication → OAuth Server, enable OAuth and set the authorization path to `/oauth/consent`. Verify the Site URL matches the canonical app origin. OAuth server is currently beta; validate it in a staging project first.
4. Preregister each trusted MCP client and its exact redirect URIs. Use authorization code with PKCE. Add its provider-generated client UUID to `MCP_OAUTH_CLIENT_IDS` as a comma-separated allowlist. Also set `MCP_OAUTH_REDIRECT_URIS` to the comma-separated exact registered callback URLs. This second allowlist validates the provider's already-consented shortcut, which returns a callback without fresh client metadata. Missing or unmatched callbacks fail closed. HTTPS and native-client HTTP loopback callbacks are supported; arbitrary custom URL schemes are not. Dynamic client registration remains disabled for this deployment design.
5. Use asymmetric JWT signing keys (ES256 or RS256) and verify Supabase's public JWKS endpoint. Never distribute the signing secret or service-role key to a client.
6. Review `supabase/mcp-access-token-hook.sql`. Replace the audience and client UUID placeholders with the exact resource URL and allowlist above. Deploy the function separately and select it as the Supabase Custom Access Token Hook. The function is SECURITY INVOKER in a private schema, executable only by `supabase_auth_admin`. If another access-token hook already exists, integrate this branch into it rather than replacing its behavior.
7. The hook changes `aud` only for the allowlisted OAuth `client_id` claims. Ordinary browser JWTs and unrelated OAuth clients retain their original claims. Keep the MCP and hook allowlists synchronized. Verify token refresh retains the dedicated MCP audience. Do not add a fictional `tasks:write` OAuth scope or authorize from user-editable metadata.
8. Set `MCP_ENABLED=true` only after this configuration is verified. Unset/false disables the MCP endpoint and shows disabled states on `/oauth/consent` and `/connections`. HTTP URLs are permitted only for explicit local development with loopback hosts.

## Consent and disconnection

Start a connection from the MCP client. Authentication preserves `authorization_id` through `/login`, then `/oauth/consent` displays the registered client and callback origin. Read-only permissions are the default. Work edits, destructive operations, and membership/invitation management require separate selections; operations marked destructive and security-sensitive require both relevant selections. The user explicitly chooses workspaces or all currently authorized and future workspaces. No selected workspace means no workspace data. Delegations expire after the chosen one hour, one day, seven days or thirty days. Current membership and ownership remain authoritative.

Consent submits through a same-origin authenticated Server Action, re-fetches provider details, matches the current user and allowed client, and compares the returned callback to the registered URI. It saves the application delegation only after the user clicks Allow access. Provider consent and application PostgreSQL writes cannot commit atomically: if provider approval or callback validation fails, the action attempts to revoke the saved application delegation and directs the user to Connections for recovery. A database outage during cleanup requires an operator/user retry; do not infer success from a failed transport.

Supabase may return a completed redirect for previously granted consent without returning fresh consent details. This path never creates or expands a Saathi delegation. If application access was revoked or expired, disconnect retained OAuth consent at `/connections` and reconnect to obtain a fresh consent screen. Connections can also clean up provider-only consent with no application delegation.

Disconnect first revokes the actor-bound application delegation, then asks Supabase to revoke that user's OAuth grant. If provider cleanup fails, application access stays disabled and the page offers a cleanup retry. Provider grant revocation invalidates refresh tokens and client sessions; the MCP resource also checks its own current delegation on every request. Human password recovery and token setup remain browser/account flows, never MCP tools.

## Activation evidence required

Before declaring a deployment ready, exercise a real MCP client: protected-resource discovery; PKCE/login/explicit consent; allowed reads and edits; scope/workspace denial; exact-command retry; refresh; expiry and revocation; provider-cleanup retry; membership removal; and a browser login regression. Verify a browser JWT with the ordinary `authenticated` audience fails against MCP, while the dedicated audience is accepted. Confirm unrelated OAuth clients cannot reach the resource. Redact access tokens, authorization codes, passwords and connection strings from diagnostics.

Public metadata is at `/.well-known/oauth-protected-resource/mcp`; unauthenticated MCP protocol requests receive an OAuth challenge. A model/client setting alone is not deployment verification. This document and the hook SQL are reviewable deployment artifacts, not evidence that hosted OAuth settings have been changed.

The disposable local harness is `node --experimental-strip-types scripts/verify-mcp-local.mjs` on Node 22. It requires the verified local Supabase stack on ports 56321/56322 and real Redis on 56379. The default project is `saathi-qa-20261105`; Linux CI explicitly sets `SAATHI_QA_SUPABASE_PROJECT=saathi-performance-ci`. `SAATHI_QA_SUPABASE_CLI` may select the installed CLI executable. Other project names and hosted database URLs are rejected.

The harness creates a separate GoTrue container and fresh database, runs the repository migrations, obtains real password and PKCE sessions, and exercises the actual MCP runtime over HTTP. Its required assertions cover discovery, writes, exact retries, SQL effects, outbox delivery, refresh, revocation and the browser audience boundary. It removes only its marked resources and records sanitized results in `.local-test/mcp-oauth-*/result.json`. A passing provider-token check alone does not satisfy the full runtime gate; require the final result's `passed: true` and successful cleanup before accepting this evidence.

## References

- [Supabase OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase OAuth token security and audience hooks](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization)
