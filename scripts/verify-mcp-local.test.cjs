const test = require('node:test')
const assert = require('node:assert/strict')
const root = process.cwd()
const project = 'saathi-qa-20261105'
const inspect = (name, image) => ({ Name: '/' + name, Config: { Image: image, Labels: { 'com.supabase.cli.project': project, 'com.supabase.cli.workdir': root + '/.local-test/supabase-acceptance' }, Env: ['GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:hidden@supabase_db_saathi-qa-20261105:5432/postgres'] }, NetworkSettings: { Networks: { ['supabase_network_' + project]: {} } } })
test('local OAuth verification accepts only the owned QA infrastructure and loopback database', async () => {
  const { validateLocalMcpInfrastructure } = await import('./verify-mcp-local.mjs')
  const auth = inspect('supabase_auth_' + project, 'public.ecr.aws/supabase/gotrue:v2.197.0'), database = inspect('supabase_db_' + project, 'public.ecr.aws/supabase/postgres:17.11.0.004')
  const status = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgres://postgres:hidden@127.0.0.1:56322/postgres' }
  assert.equal(validateLocalMcpInfrastructure(root, auth, database, status, project).network, 'supabase_network_' + project)
  assert.throws(() => validateLocalMcpInfrastructure(root, auth, database, { ...status, DB_URL: 'postgres://postgres:hidden@hosted.example:56322/postgres' }, project))
  const other = structuredClone(auth); other.Config.Labels['com.supabase.cli.project'] = 'another-project'
  assert.throws(() => validateLocalMcpInfrastructure(root, other, database, status, project))
})

test('only the two explicit disposable projects are permitted, including Linux CI', async () => {
  const { resolveLocalMcpProject, validateLocalMcpInfrastructure } = await import('./verify-mcp-local.mjs')
  assert.equal(resolveLocalMcpProject({}), project)
  assert.equal(resolveLocalMcpProject({ SAATHI_QA_SUPABASE_PROJECT: 'saathi-performance-ci' }), 'saathi-performance-ci')
  assert.throws(() => resolveLocalMcpProject({ SAATHI_QA_SUPABASE_PROJECT: 'hosted-production' }))
  const ci = 'saathi-performance-ci'
  const auth = inspect('supabase_auth_' + project, 'public.ecr.aws/supabase/gotrue:v2.197.0'), database = inspect('supabase_db_' + project, 'public.ecr.aws/supabase/postgres:17.11.0.004')
  for (const container of [auth, database]) {
    container.Name = container.Name.replace(project, ci)
    container.Config.Labels['com.supabase.cli.project'] = ci
    container.Config.Env = container.Config.Env.map(value => value.replaceAll(project, ci))
    container.NetworkSettings.Networks = { ['supabase_network_' + ci]: {} }
  }
  assert.equal(validateLocalMcpInfrastructure(root, auth, database, { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgres://postgres:hidden@127.0.0.1:56322/postgres' }, ci).network, 'supabase_network_' + ci)
})
test('PKCE and proxy paths preserve the real provider flow without logging or fabricating tokens', async () => {
  const { pkceChallenge, authProxyPath, parseAuthorizationLocation } = await import('./verify-mcp-local.mjs')
  assert.equal(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  assert.equal(authProxyPath('/auth/v1/user?ignored=value'), '/user?ignored=value')
  assert.equal(authProxyPath('/.well-known/oauth-authorization-server/auth/v1'), '/.well-known/oauth-authorization-server')
  const id = 'a0ee1450-5025-4f48-8b37-32cf71af3c44'
  assert.equal(parseAuthorizationLocation('http://127.0.0.1:56698/oauth/consent?authorization_id=' + id, 'http://127.0.0.1:56698'), id)
  const native = 'Abcd1234Efgh5678Ijkl9012Mnop3456'
  assert.equal(parseAuthorizationLocation('http://127.0.0.1:56698/oauth/consent?authorization_id=' + native, 'http://127.0.0.1:56698'), native)
  assert.throws(() => parseAuthorizationLocation('https://foreign.example/oauth/consent?authorization_id=' + id, 'http://127.0.0.1:56698'))
})
test('MCP transport selects its matching JSON-RPC response rather than a trailing SSE notification', async () => {
  const { decodeMcpResponse } = await import('./verify-mcp-local.mjs')
  const body = 'event: message\r\ndata: {"jsonrpc":"2.0","id":7,"result":{"serverInfo":{"name":"saathi"}}}\r\n\r\ndata: {"jsonrpc":"2.0","method":"notifications/message","params":{}}\r\n\r\n'
  assert.equal(decodeMcpResponse(body, 'text/event-stream', 7).serverInfo.name, 'saathi')
  assert.throws(() => decodeMcpResponse(body, 'text/event-stream', 8))
})

test('revocation evidence accepts the SDK missing-session normalization but rejects outages and foreign identities', async () => {
  const { classifyRevokedProviderIdentity } = await import('./verify-mcp-local.mjs')
  const { AuthSessionMissingError } = await import('@supabase/supabase-js')
  assert.deepEqual(classifyRevokedProviderIdentity({ data: { user: null }, error: new AuthSessionMissingError() }, 'actor'), { behavior: 'session_rejected', sdkStatus: 400, sdkError: 'AuthSessionMissingError', providerCode: null })
  assert.equal(classifyRevokedProviderIdentity({ data: { user: null }, error: { status: 404, code: 'session_not_found' } }, 'actor').behavior, 'session_rejected')
  assert.equal(classifyRevokedProviderIdentity({ data: { user: { id: 'actor' } }, error: null }, 'actor').behavior, 'identity_still_accepted')
  for (const error of [{ status: 503, code: 'unexpected_failure' }, { status: 0 }, { status: 404, code: 'unknown' }]) assert.throws(() => classifyRevokedProviderIdentity({ data: { user: null }, error }, 'actor'))
  assert.throws(() => classifyRevokedProviderIdentity({ data: { user: { id: 'foreign' } }, error: null }, 'actor'))
})
