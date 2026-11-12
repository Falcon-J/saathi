import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT, type JWTVerifyGetKey } from 'jose'
import { createMcpAuthenticator, McpAuthenticationError } from './auth.ts'
import { resolveMcpConfig } from './config.ts'

const userId = 'a0ee1450-5025-4f48-8b37-32cf71af3c44'
const config = resolveMcpConfig({ MCP_ENABLED: 'true', NEXT_PUBLIC_APP_URL: 'https://saathi.example', NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', MCP_OAUTH_CLIENT_IDS: 'agent-client' })
if (!config.enabled) throw new Error('configuration disabled')
const enabled = config
const keys = generateKeyPair('ES256')
const localJwks = keys.then(async pair => createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test', alg: 'ES256' }] }))
const jwks: JWTVerifyGetKey = async (header, signed) => (await localJwks)(header, signed)
async function token(changes: Record<string, unknown> = {}) {
  return new SignJWT({ sub: userId, role: 'authenticated', client_id: 'agent-client', iss: enabled.issuer, aud: enabled.resource, exp: Math.floor(Date.now() / 1000) + 60, ...changes }).setProtectedHeader({ alg: 'ES256', kid: 'test' }).sign((await keys).privateKey)
}
const actor = { id: userId, email: 'member@example.com', emailConfirmed: true, profileId: userId }
const grant = { id: 'b0ee1450-5025-4f48-8b37-32cf71af3c44', userId, clientId: 'agent-client', capabilities: ['tasks.read', 'tasks.write'], workspaceIds: ['c0ee1450-5025-4f48-8b37-32cf71af3c44'], expiresAt: new Date(Date.now() + 60000).toISOString(), revokedAt: null }
const request = (jwt: string) => new Request(enabled.resource, { headers: { Authorization: `Bearer ${jwt}` } })
const deps = { keyResolver: jwks, resolveActor: async () => actor, resolveDelegation: async () => grant }

test('verified client admission precedes expensive live identity and delegation reads', async () => {
  const phases: string[] = []
  const authenticate = createMcpAuthenticator(enabled, { ...deps,
    admit: async identity => { assert.deepEqual(identity, { userId, clientId: 'agent-client' }); phases.push('admit'); throw new McpAuthenticationError(429) },
    resolveActor: async () => { phases.push('identity'); return actor },
    resolveDelegation: async () => { phases.push('grant'); return grant },
  })
  await assert.rejects(() => authenticate(request('malformed')), McpAuthenticationError)
  assert.deepEqual(phases, [])
  await assert.rejects(async () => authenticate(request(await token())), (error: unknown) => error instanceof McpAuthenticationError && error.status === 429)
  assert.deepEqual(phases, ['admit'])
})

test('verified identity and current delegation determine principal; request data never supplies actor', async () => {
  const authenticate = createMcpAuthenticator(enabled, deps)
  const req = new Request(enabled.resource + '?userId=spoof', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'spoof' }) })
  assert.deepEqual(await authenticate(req), { userId, clientId: 'agent-client', grantId: 'b0ee1450-5025-4f48-8b37-32cf71af3c44', capabilities: grant.capabilities, workspaceIds: grant.workspaceIds })
})

test('requests including discovery require bearer authorization; cookies cannot authorize MCP', async () => {
  const authenticate = createMcpAuthenticator(enabled, deps)
  const headerSets: HeadersInit[] = [{}, { Cookie: 'session=secret' }, { Authorization: 'Basic secret' }]
  for (const headers of headerSets) {
    await assert.rejects(() => authenticate(new Request(enabled.resource, { headers })), McpAuthenticationError)
  }
})

test('JWT rejects browser audience, wrong issuer, expiry, malformed subject, role, client and signature', async () => {
  const authenticate = createMcpAuthenticator(enabled, deps)
  for (const changes of [{ aud: 'authenticated' }, { iss: 'https://evil.example' }, { exp: 1 }, { sub: 'spoof' }, { role: 'service_role' }, { client_id: 'unregistered' }, { client_id: undefined }, { exp: undefined }]) {
    await assert.rejects(async () => authenticate(request(await token(changes))), McpAuthenticationError)
  }
  const other = await generateKeyPair('ES256')
  const forged = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: 'ES256', kid: 'test' }).sign(other.privateKey)
  await assert.rejects(() => authenticate(request(forged)), McpAuthenticationError)
})

test('confirmation, matching live profile and current grant are mandatory', async () => {
  const req = request(await token())
  for (const resolved of [null, { ...actor, emailConfirmed: false }, { ...actor, profileId: 'another-user' }, { ...actor, id: 'another-user' }]) {
    await assert.rejects(() => createMcpAuthenticator(enabled, { ...deps, resolveActor: async () => resolved })(req), McpAuthenticationError)
  }
  for (const resolved of [null, { ...grant, revokedAt: new Date().toISOString() }, { ...grant, expiresAt: new Date(1).toISOString() }, { ...grant, userId: 'another-user' }, { ...grant, clientId: 'another-client' }]) {
    await assert.rejects(() => createMcpAuthenticator(enabled, { ...deps, resolveDelegation: async () => resolved })(req), McpAuthenticationError)
  }
})

test('dependency outages fail closed with redacted errors and do not resemble invalid credentials', async () => {
  const secret = await token()
  await assert.rejects(() => createMcpAuthenticator(enabled, { ...deps, resolveActor: async () => { throw new Error(secret) } })(request(secret)), (error: unknown) => error instanceof McpAuthenticationError && error.status === 503 && !error.message.includes(secret))
  await assert.rejects(() => createMcpAuthenticator(enabled, { ...deps, resolveDelegation: async () => { throw new Error(secret) } })(request(secret)), (error: unknown) => error instanceof McpAuthenticationError && error.status === 503 && !error.message.includes(secret))
})

test('canonical audience arrays are accepted and reused authenticator rechecks delegation every request', async () => {
  let revoked = false
  let calls = 0
  const authenticate = createMcpAuthenticator(enabled, { ...deps, resolveDelegation: async () => { calls++; return { ...grant, revokedAt: revoked ? new Date().toISOString() : null } } })
  const req = request(await token({ aud: [enabled.resource, 'other-resource'] }))
  await authenticate(req)
  revoked = true
  await assert.rejects(() => authenticate(req), McpAuthenticationError)
  assert.equal(calls, 2)
})
