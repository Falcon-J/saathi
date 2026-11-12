import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideMcpConsent, consentSelection, validateOAuthRedirect, revokeMcpConnection, consentAuthorizationId } from './consent-service.ts'
const actorId = 'a0ee1450-5025-4f48-8b37-32cf71af3c44', authorizationId = 'b0ee1450-5025-4f48-8b37-32cf71af3c44', clientId = 'c0ee1450-5025-4f48-8b37-32cf71af3c44'
const details = { authorization_id: authorizationId, redirect_uri: 'https://agent.example/callback', client: { id: clientId, name: 'Agent' }, user: { id: actorId }, scope: 'email' }
function form() { const value = new FormData(); value.set('decision', 'approve'); value.set('expiry', '7d'); return value }
test('provider authorization IDs are opaque public identifiers rather than internal row UUIDs', () => {
  const native = 'Abcd1234Efgh5678Ijkl9012Mnop3456'
  assert.equal(consentAuthorizationId(native), native)
  for (const value of ['', 'short', '../authorizations/private', 'a'.repeat(129), 'validIdentifier16?redirect=foreign']) assert.throws(() => consentAuthorizationId(value))
})
test('consent defaults to read-only with no workspace grant and requires explicit all-workspace choice', () => {
  const read = consentSelection(form(), new Date('2026-01-01T00:00:00Z'))
  assert.deepEqual(read.workspaceIds, [])
  assert.ok(read.capabilities.every(value => value.endsWith(':read')))
  assert.equal(read.capabilities.includes('canvas:access_read'), false)
  assert.equal(read.expiresAt, '2026-01-08T00:00:00.000Z')
  const all = form(); all.set('all_workspaces', 'on')
  assert.equal(consentSelection(all).workspaceIds, null)
  all.append('workspace_id', actorId)
  assert.throws(() => consentSelection(all))
})
test('registered redirect comparison rejects wrong host/path, credential URLs and unapproved query changes', () => {
  assert.equal(validateOAuthRedirect('https://agent.example/callback?code=hidden&state=value', details.redirect_uri), 'https://agent.example/callback?code=hidden&state=value')
  for (const url of ['https://evil.example/callback', 'https://agent.example/other', 'javascript:alert(1)', 'https://user:password@agent.example/callback', 'https://agent.example/callback?next=https://evil.example']) assert.throws(() => validateOAuthRedirect(url, details.redirect_uri))
})
test('consent rechecks identity/client and saves only after explicit approval, revoking app access if provider fails', async () => {
  const operations: string[] = []
  const dependencies = { getDetails: async () => details, save: async () => { operations.push('save'); return { id: authorizationId } }, revoke: async () => { operations.push('revoke'); return true }, approve: async () => { operations.push('provider'); throw new Error('secret') }, deny: async () => ({ redirect_url: details.redirect_uri + '?error=access_denied' }) }
  await assert.rejects(() => decideMcpConsent({ actorId, authorizationId, clientIds: [clientId], form: form() }, dependencies))
  assert.deepEqual(operations, ['save', 'provider', 'revoke'])
  operations.length = 0
  await assert.rejects(() => decideMcpConsent({ actorId: authorizationId, authorizationId, clientIds: [clientId], form: form() }, dependencies))
  assert.deepEqual(operations, [])
  const deny = form(); deny.set('decision', 'deny')
  assert.match(await decideMcpConsent({ actorId, authorizationId, clientIds: [clientId], form: deny }, dependencies), /access_denied/)
  assert.deepEqual(operations, [])
})
test('provider already-consented redirects never manufacture an application delegation', async () => {
  const dependencies = { getDetails: async () => ({ redirect_url: details.redirect_uri + '?code=hidden' }), save: async () => { throw new Error('must not save') }, revoke: async () => false, approve: async () => { throw new Error('must not approve') }, deny: async () => { throw new Error('must not deny') } }
  await assert.rejects(() => decideMcpConsent({ actorId, authorizationId, clientIds: [clientId], form: form() }, dependencies))
  assert.match(await decideMcpConsent({ actorId, authorizationId, clientIds: [clientId], redirectUris: [details.redirect_uri], form: form() }, dependencies), /callback/)
  const deny = form(); deny.set('decision', 'deny')
  await assert.rejects(() => decideMcpConsent({ actorId, authorizationId, clientIds: [clientId], redirectUris: [details.redirect_uri], form: deny }, dependencies))
})
test('work edits exclude destructive and security operations; joint actions require both selections', () => {
  const edits = form(); edits.set('work_edits', 'on')
  const permissions = consentSelection(edits).capabilities
  assert.ok(permissions.includes('tasks:write'))
  assert.ok(!permissions.includes('workspaces:archive'))
  assert.ok(!permissions.includes('workspaces:transfer'))
  assert.ok(!permissions.includes('invitations:revoke'))
  const members = form(); members.set('membership', 'on')
  assert.ok(consentSelection(members).capabilities.includes('canvas:access_read'))
  assert.ok(!consentSelection(members).capabilities.includes('members:write'))
  members.set('destructive', 'on')
  assert.ok(consentSelection(members).capabilities.includes('members:write'))
})
test('connection revocation disables application access before provider cleanup and reports partial cleanup', async () => {
  const operations: string[] = []
  const result = await revokeMcpConnection(actorId, authorizationId, clientId, { revoke: async () => { operations.push('app'); return true }, revokeProvider: async () => { operations.push('provider'); throw new Error('provider secret') } })
  assert.deepEqual(operations, ['app', 'provider'])
  assert.equal(result.providerCleanupPending, true)
})
