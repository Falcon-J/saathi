import { z } from 'zod'
import { platformCapabilities } from '../../features/platform/capabilities.ts'
import type { McpDelegationInput } from '../../features/mcp/delegations.ts'

export interface ConsentDetails { authorization_id: string; redirect_uri: string; client: { id: string; name: string }; user: { id: string }; scope: string }
export type ConsentDetailsResult = ConsentDetails | { redirect_url: string }
export type ConsentState = { error?: string; providerCleanupPending?: boolean; revoked?: boolean }
// GoTrue's public authorization_id is opaque (currently 32 alphanumeric characters),
// distinct from its internal UUID. Bound it and exclude path/query syntax.
export const consentAuthorizationId = (value: unknown) => z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/).parse(value)

function redirectUrl(value: string): URL {
  const url = new URL(value)
  if (url.username || url.password || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('OAuth redirect is unavailable')
  return url
}
/** The expected URI comes only from re-fetched provider authorization details. */
export function validateOAuthRedirect(value: string, expected?: string): string {
  const url = redirectUrl(value)
  if (expected) {
    const registered = redirectUrl(expected)
    if (url.origin !== registered.origin || url.pathname !== registered.pathname) throw new Error('OAuth redirect does not match registered callback')
    for (const [key, entry] of registered.searchParams) if (url.searchParams.get(key) !== entry) throw new Error('OAuth callback parameters changed')
    for (const key of url.searchParams.keys()) if (!registered.searchParams.has(key) && !['code', 'state', 'error', 'error_description', 'error_uri', 'iss'].includes(key)) throw new Error('Unexpected OAuth callback parameter')
  }
  return url.href
}
export function mcpRedirectUris(value = process.env.MCP_OAUTH_REDIRECT_URIS): string[] {
  return (value ?? '').split(',').map(entry => entry.trim()).filter(Boolean).map(entry => redirectUrl(entry).href)
}
export function validateExistingConsentRedirect(value: string, registered: readonly string[]): string {
  for (const expected of registered) {
    try { return validateOAuthRedirect(value, expected) } catch { /* Try another registered callback. */ }
  }
  throw new Error('OAuth callback is not allowlisted')
}

export function validateConsentDetails(details: ConsentDetails, actorId: string, authorizationId: string, clientIds: readonly string[]) {
  if (details.authorization_id !== authorizationId || details.user.id !== actorId || !clientIds.includes(details.client.id)) throw new Error('This authorization is unavailable')
  redirectUrl(details.redirect_uri)
  if (details.scope.split(/\s+/).filter(Boolean).some(scope => !['openid', 'email', 'profile', 'phone'].includes(scope))) throw new Error('Unsupported identity scope')
  return details
}

/** Unchecked boxes never enable work edits, destructive actions or membership changes. */
export function consentSelection(form: FormData, now = new Date()): McpDelegationInput {
  const edits = form.get('work_edits') === 'on', destructive = form.get('destructive') === 'on', membership = form.get('membership') === 'on'
  const capabilities = [...new Set(platformCapabilities.filter(capability => capability.available && (!capability.securitySensitive || membership) && (capability.kind === 'read' || ((!capability.destructive || destructive) && (capability.destructive || capability.securitySensitive || edits)))).flatMap(capability => [...capability.requiredScopes]))].sort()
  const ids = z.array(z.uuid()).max(1000).parse(form.getAll('workspace_id'))
  const all = form.get('all_workspaces') === 'on'
  if (all && ids.length) throw new Error('Choose selected workspaces or all workspaces')
  const duration = { '1h': 3600000, '1d': 86400000, '7d': 604800000, '30d': 2592000000 }[String(form.get('expiry'))]
  if (!duration) throw new Error('Choose an access expiry')
  return { capabilities, workspaceIds: all ? null : [...new Set(ids)].sort(), expiresAt: new Date(now.getTime() + duration).toISOString() }
}
export interface ConsentDependencies {
  getDetails: (id: string) => Promise<ConsentDetailsResult>
  save: (actorId: string, clientId: string, input: McpDelegationInput) => Promise<{ id: string }>
  revoke: (actorId: string, grantId: string) => Promise<boolean>
  approve: (id: string) => Promise<{ redirect_url: string }>
  deny: (id: string) => Promise<{ redirect_url: string }>
}
export async function decideMcpConsent(input: { actorId: string; authorizationId: string; clientIds: readonly string[]; redirectUris?: readonly string[]; form: FormData }, deps: ConsentDependencies): Promise<string> {
  const authorizationId = consentAuthorizationId(input.authorizationId)
  z.uuid().parse(input.actorId)
  const decision = z.enum(['approve', 'deny']).parse(input.form.get('decision'))
  const details = await deps.getDetails(authorizationId)
  // Supabase has already recorded this consent. Never expand or recreate application grants here.
  if ('redirect_url' in details) {
    if (decision === 'deny') throw new Error('Authorization already completed. Disconnect it in Connections.')
    return validateExistingConsentRedirect(details.redirect_url, input.redirectUris ?? [])
  }
  validateConsentDetails(details, input.actorId, authorizationId, input.clientIds)
  if (decision === 'deny') return validateOAuthRedirect((await deps.deny(authorizationId)).redirect_url, details.redirect_uri)
  const selection = consentSelection(input.form)
  const grant = await deps.save(input.actorId, details.client.id, selection)
  try {
    return validateOAuthRedirect((await deps.approve(authorizationId)).redirect_url, details.redirect_uri)
  } catch {
    // Provider consent and our SQL transaction cannot commit atomically. Fail closed.
    await deps.revoke(input.actorId, grant.id)
    throw new Error('Authorization was not completed. Application access was revoked. Reconnect to try again.')
  }
}

export async function revokeMcpConnection(actorId: string, grantId: string, clientId: string, deps: { revoke: (actorId: string, grantId: string) => Promise<boolean>; revokeProvider: (clientId: string) => Promise<void> }) {
  z.uuid().parse(actorId); z.uuid().parse(grantId); z.string().min(1).max(200).parse(clientId)
  if (!await deps.revoke(actorId, grantId)) throw new Error('Connection unavailable')
  try { await deps.revokeProvider(clientId); return { providerCleanupPending: false } }
  catch { return { providerCleanupPending: true } }
}
