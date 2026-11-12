import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveMcpConfig, mcpProtectedResourceMetadata } from './config.ts'

const env = { MCP_ENABLED: 'true', NEXT_PUBLIC_APP_URL: 'https://saathi.example', NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', MCP_OAUTH_CLIENT_IDS: 'client-one, client-two' }

test('MCP is disabled by default and explicit activation requires complete configuration', () => {
  assert.deepEqual(resolveMcpConfig({}), { enabled: false })
  assert.throws(() => resolveMcpConfig({ MCP_ENABLED: 'true' }), /configuration/i)
  assert.throws(() => resolveMcpConfig({ ...env, MCP_OAUTH_CLIENT_IDS: '' }), /client/i)
  assert.throws(() => resolveMcpConfig({ ...env, MCP_ENABLED: '1' }), /true or false/)
})

test('canonical resource metadata does not invent application OAuth scopes', () => {
  const config = resolveMcpConfig(env)
  assert.equal(config.enabled, true)
  if (!config.enabled) throw new Error('missing config')
  assert.equal(config.resource, 'https://saathi.example/mcp')
  assert.equal(config.issuer, 'https://project.supabase.co/auth/v1')
  assert.equal(config.jwksUrl, 'https://project.supabase.co/auth/v1/.well-known/jwks.json')
  assert.deepEqual(config.clientIds, ['client-one', 'client-two'])
  assert.deepEqual(mcpProtectedResourceMetadata(config), { resource: config.resource, authorization_servers: [config.issuer], bearer_methods_supported: ['header'] })
})

test('only explicit development allows loopback HTTP; URL credentials and fragments are rejected', () => {
  for (const resource of ['http://saathi.example/mcp', 'https://user:secret@saathi.example/mcp', 'https://saathi.example/mcp#fragment', 'https://saathi.example/mcp?query=1']) {
    assert.throws(() => resolveMcpConfig({ ...env, MCP_RESOURCE_URL: resource }), /URL|HTTPS/i)
  }
  assert.throws(() => resolveMcpConfig({ ...env, MCP_RESOURCE_URL: 'http://localhost:3000/mcp' }), /HTTPS/)
  const config = resolveMcpConfig({ ...env, NODE_ENV: 'development', MCP_RESOURCE_URL: 'http://localhost:3000/mcp' })
  assert.ok(config.enabled)
})
