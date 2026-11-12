import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { validateMcpDelegationInput, createMcpDelegationService, type McpDelegationStore } from './delegations.ts'
import type { McpDelegation } from './auth.ts'
const userId = 'a0ee1450-5025-4f48-8b37-32cf71af3c44'
const workspaceId = 'b0ee1450-5025-4f48-8b37-32cf71af3c44'
const grantId = 'c0ee1450-5025-4f48-8b37-32cf71af3c44'
const input = { capabilities: ['tasks:read', 'tasks:write'], workspaceIds: [workspaceId], expiresAt: null }
test('delegation inputs accept registered application capabilities and canonicalize duplicate restrictions', () => {
  assert.deepEqual(validateMcpDelegationInput({ ...input, capabilities: ['tasks:write', 'tasks:read', 'tasks:read'], workspaceIds: [workspaceId, workspaceId] }), input)
  for (const invalid of [{ ...input, capabilities: ['openid'] }, { ...input, capabilities: ['tasks:destroy-world'] }, { ...input, workspaceIds: ['private@example.com'] }, { ...input, expiresAt: 'bad-date' }, { ...input, expiresAt: '2000-01-01T00:00:00.000Z' }, { ...input, userId: 'spoof' }]) assert.throws(() => validateMcpDelegationInput(invalid))
})
test('saving validates current membership inside transaction and revocation is actor bound', async () => {
  let writes = 0, revoked: string[] = []
  const existing: McpDelegation = { id: grantId, userId, clientId: 'client', ...input, revokedAt: null }
  const store: McpDelegationStore = { transaction: async operation => operation({ lock: async () => {}, find: async () => existing, workspaceIds: async () => [workspaceId], upsert: async (_actor, _client, value) => { writes++; return { ...existing, ...value } }, revoke: async (actor, grant) => { revoked = [actor, grant]; return true } }) }
  const service = createMcpDelegationService(store)
  assert.equal((await service.save(userId, 'client', input)).id, grantId)
  await assert.rejects(() => service.save(userId, 'client', { ...input, workspaceIds: [grantId] }))
  assert.equal(writes, 1)
  assert.equal(await service.revoke(userId, grantId), true)
  assert.deepEqual(revoked, [userId, grantId])
})
test('expired and revoked stored delegation is unavailable and no actor substitution is accepted', async () => {
  let current: McpDelegation = { id: grantId, userId, clientId: 'client', ...input, revokedAt: '2026-01-01T00:00:00Z' }
  const store: McpDelegationStore = { transaction: async operation => operation({ lock: async () => {}, find: async () => current, workspaceIds: async () => [], upsert: async () => current, revoke: async () => false }) }
  const service = createMcpDelegationService(store)
  assert.equal(await service.get({ userId, clientId: 'client' }), null)
  current = { ...current, revokedAt: null, expiresAt: '2000-01-01T00:00:00Z' }
  assert.equal(await service.get({ userId, clientId: 'client' }), null)
  current = { ...current, expiresAt: null, userId: grantId }
  assert.equal(await service.get({ userId, clientId: 'client' }), null)
})
test('migration retains actor/client command receipts independently of workspace deletion and denies browser roles', () => {
  const sql = readFileSync(new URL('../../drizzle/0011_platform_access_and_receipts.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE platform_command_receipts/i)
  assert.match(sql, /PRIMARY KEY\s*\(actor_user_id,\s*client_id,\s*command_id\)/i)
  const receipts = sql.slice(sql.indexOf('CREATE TABLE platform_command_receipts'))
  assert.ok(!/REFERENCES\s+(?:public\.)?workspaces/i.test(receipts))
  assert.match(sql, /ALTER TABLE platform_delegations ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /ALTER TABLE platform_command_receipts ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /REVOKE ALL ON TABLE platform_delegations FROM PUBLIC, anon, authenticated/i)
  const journal = JSON.parse(readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8'))
  assert.equal(journal.entries.find((entry: { idx: number }) => entry.idx === 11)?.tag, '0011_platform_access_and_receipts')
})
