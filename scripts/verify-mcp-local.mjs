import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import net from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { startLocalRedisRest } from './local-redis-rest.mjs'

export function resolveLocalMcpProject(env = process.env) {
  const project = env.SAATHI_QA_SUPABASE_PROJECT || 'saathi-qa-20261105'
  assert.ok(['saathi-qa-20261105', 'saathi-performance-ci'].includes(project), 'Only an owned disposable local project is permitted')
  return project
}
const project = resolveLocalMcpProject()
const authName = `supabase_auth_${project}`, databaseContainer = `supabase_db_${project}`
const root = fileURLToPath(new URL('../', import.meta.url))
const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
const loopback = (value, port, protocols) => {
  const url = new URL(value)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port === String(port) && protocols.includes(url.protocol))
  return url
}
function envOf(container) { return Object.fromEntries(container.Config.Env.map(value => { const index = value.indexOf('='); return [value.slice(0, index), value.slice(index + 1)] })) }

export function validateLocalMcpInfrastructure(workspace, auth, database, status, expectedProject = project) {
  assert.equal(resolveLocalMcpProject({ SAATHI_QA_SUPABASE_PROJECT: expectedProject }), expectedProject)
  for (const [container, name] of [[auth, `supabase_auth_${expectedProject}`], [database, `supabase_db_${expectedProject}`]]) {
    assert.equal(container.Name, '/' + name)
    assert.equal(container.Config.Labels['com.supabase.cli.project'], expectedProject)
    assert.ok(samePath(container.Config.Labels['com.supabase.cli.workdir'], resolve(workspace, '.local-test/supabase-acceptance')))
  }
  assert.match(auth.Config.Image, /^public\.ecr\.aws\/supabase\/gotrue:v2\.197\.0$/)
  assert.match(database.Config.Image, /^public\.ecr\.aws\/supabase\/postgres:/)
  loopback(status.API_URL, 56321, ['http:'])
  assert.equal(loopback(status.DB_URL, 56322, ['postgres:', 'postgresql:']).pathname, '/postgres')
  assert.equal(new URL(envOf(auth).GOTRUE_DB_DATABASE_URL).hostname, `supabase_db_${expectedProject}`)
  const network = `supabase_network_${expectedProject}`
  assert.ok(auth.NetworkSettings.Networks[network] && database.NetworkSettings.Networks[network])
  return { network }
}
export const pkceChallenge = verifier => createHash('sha256').update(verifier).digest('base64url')
export function authProxyPath(path) {
  if (path === '/.well-known/oauth-authorization-server/auth/v1') return '/.well-known/oauth-authorization-server'
  if (!path.startsWith('/auth/v1/')) throw new Error('Unknown local proxy path')
  return path.slice('/auth/v1'.length)
}
export function parseAuthorizationLocation(location, origin) {
  const url = new URL(location)
  assert.equal(url.origin, origin); assert.equal(url.pathname, '/oauth/consent')
  const id = url.searchParams.get('authorization_id')
  assert.match(id ?? '', /^[A-Za-z0-9_-]{16,128}$/)
  return id
}
export function decodeMcpResponse(body, contentType, id) {
  const messages = contentType?.includes('text/event-stream')
    ? body.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5).trimStart()))
    : [JSON.parse(body)]
  const envelope = messages.find(message => message?.id === id)
  assert.ok(envelope && !envelope.error && Object.hasOwn(envelope, 'result'))
  return envelope.result
}

function command(program, args, options = {}) {
  return new Promise((done, reject) => execFile(program, args, { cwd: root, windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024, ...options }, (error, stdout) => error ? reject(new Error('Local infrastructure command failed')) : done(stdout)))
}
const inspect = async name => JSON.parse(await command('docker', ['inspect', name]))[0]
async function freePort(port) {
  await new Promise((done, reject) => { const server = net.createServer(); server.once('error', () => reject(new Error('Local OAuth verification port is occupied'))); server.listen(port, '127.0.0.1', () => server.close(done)) })
}
const closeServer = server => new Promise((done, reject) => server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : done()))
function requireData(result, label) { if (result.error || !result.data) { const error = new Error(label); error.status = result.error?.status; throw error } return result.data }
function safeError(error) {
  return { errorType: error?.name, causeCode: typeof error?.cause?.code === 'string' && /^[A-Z0-9_]+$/.test(error.cause.code) ? error.cause.code : undefined,
    sourceFrames: typeof error?.stack === 'string' ? [...error.stack.matchAll(/([A-Za-z0-9_-]+\.(?:mjs|ts|tsx|js):\d+:\d+)/g)].slice(0, 5).map(match => match[1]) : [] }
}

/** Real GoTrue-issued users/tokens only. No hosted environment files or existing QA settings change. */
export async function verifyMcpLocal({ log = value => console.log(JSON.stringify(value)) } = {}) {
  const runId = randomUUID(), suffix = runId.replaceAll('-', '').slice(0, 12)
  const manifest = { container: `saathi-mcp-verify-${suffix}`, database: `saathi_mcp_verify_${suffix}`, project, authPort: 56699, proxyPort: 56698 }
  const base = `http://127.0.0.1:${manifest.proxyPort}`, issuer = base + '/auth/v1', resource = base + '/mcp', callback = base + '/callback'
  let phase = 'infrastructure-validation', adminDb, db, proxy, redisBridge, applicationDb, loadSource, runtimeHandler, metadataHandler, databaseCreated = false, containerCreated = false, failed = false
  const redisScopes = new Set(), ownedWorkspaces = new Set()
  const cleanup = { containerRemoved: false, databaseRemoved: false, proxyClosed: false }
  const evidence = []
  const report = result => { const entry = { scope: 'isolated real Supabase MCP OAuth', phase, result }; evidence.push(entry); log(entry) }
  try {
    const cli = process.env.SAATHI_QA_SUPABASE_CLI || 'supabase'
    const status = JSON.parse(await command(cli, ['status', '--workdir', '.local-test/supabase-acceptance', '-o', 'json']))
    const auth = await inspect(authName), database = await inspect(databaseContainer)
    const { network } = validateLocalMcpInfrastructure(root, auth, database, status)
    const originalId = auth.Id, originalEnvironment = JSON.stringify(auth.Config.Env)
    // This sibling talks directly to GoTrue, without Kong's opaque API-key translation.
    const existing = envOf(auth), publicKey = status.ANON_KEY, adminKey = status.SERVICE_ROLE_KEY
    assert.ok(publicKey && adminKey && existing.GOTRUE_JWT_KEYS && existing.GOTRUE_JWT_SECRET)
    assert.equal(publicKey.split('.').length, 3); assert.equal(adminKey.split('.').length, 3)
    await freePort(manifest.proxyPort); await freePort(manifest.authPort)
    report({ verifiedOwnedQaStack: true, manifest })

    phase = 'isolated-database-and-hook'
    assert.match(manifest.database, /^saathi_mcp_verify_[0-9a-f]{12}$/)
    adminDb = postgres(status.DB_URL, { max: 1, prepare: false })
    phase = 'create-isolated-database'
    await adminDb.unsafe(`CREATE DATABASE "${manifest.database}"`)
    databaseCreated = true
    phase = 'mark-isolated-database'
    await adminDb.unsafe(`COMMENT ON DATABASE "${manifest.database}" IS 'codex.saathi.mcp.verify=${runId}'`)
    const localDatabaseUrl = new URL(status.DB_URL); localDatabaseUrl.pathname = '/' + manifest.database
    db = postgres(localDatabaseUrl.href, { max: 1, prepare: false })
    phase = 'install-isolated-hook'
    // The ordinary local postgres role may create a database but cannot assign Auth ownership.
    // Use the verified container's local super-admin socket only inside this fresh database.
    await command('docker', ['exec', databaseContainer, 'psql', '-U', 'supabase_admin', '-d', manifest.database, '-v', 'ON_ERROR_STOP=1', '-q', '-c', `CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
      GRANT ALL ON SCHEMA auth TO postgres;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;
      CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE SCHEMA saathi_auth; REVOKE ALL ON SCHEMA saathi_auth FROM PUBLIC,anon,authenticated;
      GRANT USAGE ON SCHEMA saathi_auth TO supabase_auth_admin; GRANT ALL ON SCHEMA saathi_auth TO postgres;
      CREATE TABLE saathi_auth.mcp_local_oauth_clients(client_id text PRIMARY KEY,audience text NOT NULL);
      REVOKE ALL ON saathi_auth.mcp_local_oauth_clients FROM PUBLIC,anon,authenticated;
      GRANT SELECT ON saathi_auth.mcp_local_oauth_clients TO supabase_auth_admin; GRANT ALL ON saathi_auth.mcp_local_oauth_clients TO postgres;
      CREATE FUNCTION saathi_auth.mcp_local_access_token_hook(event jsonb) RETURNS jsonb
      LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $hook$
      DECLARE audience text;
      BEGIN
        SELECT c.audience INTO audience FROM saathi_auth.mcp_local_oauth_clients c WHERE c.client_id=event->'claims'->>'client_id';
        IF audience IS NOT NULL THEN event:=jsonb_set(event,'{claims,aud}',to_jsonb(audience)); END IF;
        RETURN event;
      END $hook$;
      REVOKE ALL ON FUNCTION saathi_auth.mcp_local_access_token_hook(jsonb) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION saathi_auth.mcp_local_access_token_hook(jsonb) TO supabase_auth_admin;`])
    report({ createdFreshDatabase: true, privateAudienceHook: true })

    phase = 'sibling-auth-server'
    const databaseUrl = new URL(existing.GOTRUE_DB_DATABASE_URL); databaseUrl.pathname = '/' + manifest.database
    const environment = {
      GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: issuer,
      GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: databaseUrl.href,
      GOTRUE_JWT_SECRET: existing.GOTRUE_JWT_SECRET, GOTRUE_JWT_KEYS: existing.GOTRUE_JWT_KEYS,
      GOTRUE_JWT_VALID_METHODS: 'HS256,RS256,ES256', GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_ISSUER: issuer,
      GOTRUE_JWT_ADMIN_ROLES: 'service_role,supabase_admin', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_EXP: '3600',
      GOTRUE_SITE_URL: base, GOTRUE_URI_ALLOW_LIST: callback, GOTRUE_DISABLE_SIGNUP: 'false', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
      GOTRUE_MAILER_AUTOCONFIRM: 'true', GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true', GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '0',
      GOTRUE_OAUTH_SERVER_ENABLED: 'true', GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION: 'false', GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH: '/oauth/consent',
      GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: 'true', GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI: 'pg-functions://postgres/saathi_auth/mcp_local_access_token_hook',
    }
    await command('docker', ['run', '--detach', '--pull=never', '--name', manifest.container, '--network', network,
      '--label', `codex.saathi.mcp.verify=${runId}`, '--publish', `127.0.0.1:${manifest.authPort}:9999`,
      ...Object.entries(environment).flatMap(([key, value]) => ['--env', `${key}=${value}`]), auth.Config.Image])
    containerCreated = true
    proxy = createServer(async (request, response) => {
      response.setHeader('connection', 'close')
      try {
        const chunks = []; for await (const chunk of request) chunks.push(chunk)
        const body = Buffer.concat(chunks)
        const pathname = new URL(request.url, base).pathname
        if (pathname === '/mcp' && runtimeHandler || pathname === '/.well-known/oauth-protected-resource/mcp' && metadataHandler) {
          const incoming = new Request(new URL(request.url, base), { method: request.method, headers: request.headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : body })
          const result = pathname === '/mcp' ? await runtimeHandler(incoming) : metadataHandler()
          response.writeHead(result.status, Object.fromEntries(result.headers))
          if (result.body) for await (const chunk of result.body) response.write(chunk)
          response.end(); return
        }
        const path = authProxyPath(request.url)
        const headers = { ...request.headers, connection: 'close' }; delete headers.host; delete headers['content-length']
        const upstream = await fetch(`http://127.0.0.1:${manifest.authPort}${path}`, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : body, redirect: 'manual', signal: AbortSignal.timeout(15000) })
        response.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([name]) => !['transfer-encoding', 'content-encoding', 'content-length', 'connection', 'keep-alive'].includes(name))))
        response.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) {
        if (phase !== 'sibling-auth-server') report({ bridgeFailure: true, authUserPath: request.url === '/auth/v1/user', ...safeError(error) })
        if (!response.headersSent) response.writeHead(503)
        response.end('Local transport unavailable')
      }
    })
    // Source loading can block this single test process beyond an idle socket timeout.
    // Close each transport connection so the next real request cannot reuse a stale one.
    await new Promise((done, reject) => { proxy.once('error', reject); proxy.listen(manifest.proxyPort, '127.0.0.1', done) })
    let ready = false
    for (let attempt = 0; attempt < 80; attempt++) {
      try { ready = (await fetch(issuer + '/health', { signal: AbortSignal.timeout(1000) })).ok } catch { /* GoTrue migration/startup is still running. */ }
      if (ready) break
      await delay(250)
    }
    assert.ok(ready)
    report({ healthySiblingGoTrue: true, version: 'v2.197.0' })

    phase = 'normal-application-migrations'
    await command(process.execPath, [resolve(root, 'scripts/migrate-database.mjs')], { env: { ...process.env, DATABASE_MIGRATION_URL: localDatabaseUrl.href } })
    const redisToken = randomUUID()
    redisBridge = await startLocalRedisRest({ token: redisToken })
    Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: localDatabaseUrl.href, NEXT_PUBLIC_APP_URL: base, APP_URL: base,
      NEXT_PUBLIC_SUPABASE_URL: base, NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
      MCP_ENABLED: 'true', MCP_RESOURCE_URL: resource, MCP_AUTHORIZATION_SERVER_URL: issuer, MCP_OAUTH_REDIRECT_URIS: callback,
      UPSTASH_REDIS_REST_URL: redisBridge.url, UPSTASH_REDIS_REST_TOKEN: redisToken, KV_REST_API_URL: redisBridge.url, KV_REST_API_TOKEN: redisToken, KV_URL: redisBridge.url,
      USE_MOCK_REDIS: 'false', ENABLE_REAL_TIME: 'true', ENABLE_RATE_LIMITING: 'true', ENABLE_AI_WORKSPACE: 'false', NEXT_PUBLIC_ENABLE_AI_WORKSPACE: 'false', GROQ_API_KEY: '', RESEND_API_KEY: '' })
    const { require: tsxRequire } = await import('tsx/cjs/api')
    loadSource = specifier => tsxRequire(specifier, import.meta.url)
    applicationDb = loadSource('../lib/db/client.ts').getDb()
    report({ appliedRepositoryDrizzleMigrations: true })

    phase = 'oauth-discovery-and-real-user'
    const metadataResponse = await fetch(base + '/.well-known/oauth-authorization-server/auth/v1')
    assert.ok(metadataResponse.ok)
    const metadata = await metadataResponse.json()
    assert.equal(metadata.issuer, issuer)
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    const admin = createClient(base, adminKey, options), human = createClient(base, publicKey, options), identity = createClient(base, publicKey, options)
    const password = randomUUID() + 'Aa9!', email = `mcp-${suffix}@example.test`
    phase = 'create-normal-auth-user'
    const created = requireData(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: 'MCP local verification' } }), 'Local user creation failed')
    phase = 'normal-password-sign-in'
    const signedIn = requireData(await human.auth.signInWithPassword({ email, password }), 'Normal password authentication failed')
    assert.equal(signedIn.user.id, created.user.id)
    const browserClaims = JSON.parse(Buffer.from(signedIn.session.access_token.split('.')[1], 'base64url').toString('utf8'))
    assert.deepEqual(Array.isArray(browserClaims.aud) ? browserClaims.aud : [browserClaims.aud], ['authenticated'])
    phase = 'register-local-oauth-client'
    const registered = requireData(await admin.auth.admin.oauth.createClient({ client_name: 'Isolated Saathi MCP verification', client_type: 'public', redirect_uris: [callback], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'email' }), 'OAuth client registration failed')
    const clientId = registered.client_id
    process.env.MCP_OAUTH_CLIENT_IDS = clientId
    redisScopes.add(`mcp-request:${created.user.id}:${clientId}`); redisScopes.add(`platform:${created.user.id}:${clientId}`)
    await db`INSERT INTO saathi_auth.mcp_local_oauth_clients(client_id,audience) VALUES(${clientId},${resource})`
    report({ realPasswordSession: true, browserAudienceUnchanged: true, preregisteredPublicClient: true })

    phase = 'pkce-and-explicit-consent'
    const verifier = randomBytes(48).toString('base64url'), state = randomUUID()
    const authorization = new URL(metadata.authorization_endpoint)
    for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: callback, response_type: 'code', scope: 'email', resource, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256', state })) authorization.searchParams.set(key, value)
    phase = 'oauth-authorize-request'
    const authorizationResponse = await fetch(authorization, { redirect: 'manual' })
    report({ httpStatus: authorizationResponse.status })
    assert.ok([302, 303, 307].includes(authorizationResponse.status))
    const authorizationId = parseAuthorizationLocation(authorizationResponse.headers.get('location'), base)
    phase = 'oauth-consent-details'
    const details = requireData(await human.auth.oauth.getAuthorizationDetails(authorizationId), 'Consent details failed')
    assert.equal(details.user.id, created.user.id); assert.equal(details.client.id, clientId)
    phase = 'oauth-consent-approval'
    const { decideMcpConsent } = loadSource('../components/mcp/consent-service.ts')
    const { saveMcpDelegation, getMcpDelegation, revokeMcpDelegation } = loadSource('../features/mcp/delegations.ts')
    applicationDb = loadSource('../lib/db/client.ts').getDb()
    const consentForm = new FormData(); consentForm.set('decision', 'approve'); consentForm.set('expiry', '1h'); consentForm.set('all_workspaces', 'on'); consentForm.set('work_edits', 'on')
    const redirectUrl = await decideMcpConsent({ actorId: created.user.id, authorizationId, clientIds: [clientId], redirectUris: [callback], form: consentForm }, {
      getDetails: async id => requireData(await human.auth.oauth.getAuthorizationDetails(id), 'Consent details failed'), save: saveMcpDelegation, revoke: revokeMcpDelegation,
      approve: async id => requireData(await human.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true }), 'Explicit provider consent failed'),
      deny: async id => requireData(await human.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true }), 'Provider denial failed'),
    })
    const codeUrl = new URL(redirectUrl)
    assert.equal(codeUrl.origin + codeUrl.pathname, callback); assert.equal(codeUrl.searchParams.get('state'), state)
    const code = codeUrl.searchParams.get('code'); assert.ok(code)
    phase = 'oauth-code-exchange'
    const tokenResponse = await fetch(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: callback, code, code_verifier: verifier, resource }) })
    report({ httpStatus: tokenResponse.status })
    assert.ok(tokenResponse.ok)
    const tokens = await tokenResponse.json(); assert.ok(tokens.access_token && tokens.refresh_token)
    report({ pkceExchange: true, providerConsent: true })

    phase = 'dedicated-audience-live-get-user'
    const jwks = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks.json'))
    const verified = await jwtVerify(tokens.access_token, jwks, { issuer, audience: resource, algorithms: ['ES256', 'RS256'] })
    assert.equal(verified.payload.sub, created.user.id); assert.equal(verified.payload.client_id, clientId)
    const live = requireData(await identity.auth.getUser(tokens.access_token), 'GoTrue getUser rejected dedicated-audience token')
    assert.equal(live.user.id, created.user.id); assert.ok(live.user.email_confirmed_at)
    report({ asymmetricDedicatedAudience: true, liveGoTrueGetUserAccepted: true })
    phase = 'real-runtime-import'
    const { getProfile } = loadSource('../lib/data/profiles.ts')
    assert.equal((await getProfile(created.user.id))?.id, created.user.id)
    const grant = await getMcpDelegation({ userId: created.user.id, clientId }); assert.ok(grant)
    const runtime = loadSource('../features/mcp/runtime.ts'); runtimeHandler = runtime.handleMcpRequest
    metadataHandler = loadSource('../app/.well-known/oauth-protected-resource/mcp/route.ts').GET
    applicationDb = loadSource('../lib/db/client.ts').getDb()
    phase = 'real-runtime-discovery'
    const resourceMetadata = await fetch(base + '/.well-known/oauth-protected-resource/mcp')
    assert.ok(resourceMetadata.ok); assert.equal((await resourceMetadata.json()).resource, resource)
    const unauthenticated = await fetch(resource, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} }) })
    assert.equal(unauthenticated.status, 401); assert.match(unauthenticated.headers.get('www-authenticate') ?? '', /resource_metadata=/)
    let sequence = 1
    async function rpc(token, method, params = {}) {
      const id = sequence++
      const response = await fetch(resource, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}))
        const knownErrors = ['MCP authentication required', 'MCP application access denied', 'MCP authorization service unavailable', 'MCP configuration is unavailable']
        const liveCheck = await identity.auth.getUser(token)
        const currentProfile = await getProfile(created.user.id)
        let signatureAccepted = false
        try { await jwtVerify(token, jwks, { issuer, audience: resource, algorithms: ['ES256', 'RS256'] }); signatureAccepted = true } catch { /* Diagnostic only, no token output. */ }
        report({ rpcMethod: method, httpStatus: response.status, failureClass: knownErrors.includes(failure.error) ? failure.error : 'other', liveIdentityAccepted: !liveCheck.error && !!liveCheck.data.user, liveIdentityStatus: liveCheck.error?.status, profileCurrent: currentProfile?.id === created.user.id, signatureAccepted, expRemainingSeconds: verified.payload.exp - Math.floor(Date.now() / 1000) })
        return { httpStatus: response.status }
      }
      const body = await response.text()
      return decodeMcpResponse(body, response.headers.get('content-type'), id)
    }
    const initialized = await rpc(tokens.access_token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'saathi-real-oauth-verifier', version: '1.0.0' } })
    assert.ok(initialized.serverInfo)
    const toolList = await rpc(tokens.access_token, 'tools/list')
    assert.ok(toolList.tools.some(tool => tool.name === 'workspaces.create')); assert.ok(toolList.tools.some(tool => tool.name === 'tasks.get'))
    assert.ok(!toolList.tools.some(tool => /human_review|reviewAgentRun/.test(tool.name)))
    const browserRejected = await rpc(signedIn.session.access_token, 'tools/list'); assert.equal(browserRejected.httpStatus, 401)
    async function tool(token, name, input) {
      const result = await rpc(token, 'tools/call', { name, arguments: input })
      assert.ok(!result.isError && !result.httpStatus)
      return result.structuredContent ?? JSON.parse(result.content.find(part => part.type === 'text').text)
    }
    phase = 'real-runtime-workspace-create'
    const createdWorkspace = await tool(tokens.access_token, 'workspaces.create', { commandId: randomUUID(), expectedVersion: null, name: 'Real OAuth runtime verification' })
    assert.equal(createdWorkspace.state, 'committed')
    const workspaceId = createdWorkspace.data.id; ownedWorkspaces.add(workspaceId)
    phase = 'real-runtime-task-create-retry-read'
    const commandId = randomUUID(), taskInput = { commandId, expectedVersion: null, workspaceId, title: 'Verified through GoTrue and the MCP runtime' }
    const createdTask = await tool(tokens.access_token, 'tasks.create', taskInput)
    assert.equal(createdTask.state, 'committed')
    const replayedTask = await tool(tokens.access_token, 'tasks.create', taskInput)
    assert.equal(replayedTask.data.id, createdTask.data.id)
    const taskRead = await tool(tokens.access_token, 'tasks.get', { workspaceId, taskId: createdTask.data.id })
    assert.equal(taskRead.state, 'ok'); assert.equal(taskRead.data.title, taskInput.title)
    const [effect] = await db`SELECT count(*)::int AS count FROM tasks WHERE workspace_id=${workspaceId}`; assert.equal(effect.count, 1)
    const [receipt] = await db`SELECT count(*)::int AS count FROM platform_command_receipts WHERE actor_user_id=${created.user.id} AND client_id=${clientId} AND command_id=${commandId}`; assert.equal(receipt.count, 1)
    phase = 'real-runtime-durable-outbox'
    const { flushOutbox } = loadSource('../lib/data/events.ts'); await flushOutbox(workspaceId)
    const [published] = await db`SELECT count(*)::int AS count FROM outbox_events WHERE workspace_id=${workspaceId} AND published_at IS NOT NULL`; assert.ok(published.count >= 2)
    assert.ok((await redisBridge.command(['XLEN', `stream:${workspaceId}`])) >= 2)
    report({ actualHandleMcpRequest: true, resourceAndToolDiscovery: true, discoveredToolCount: toolList.tools.length, normalProfileTrigger: true, realWorkspaceAndTaskCommitted: true, exactRetryOneTaskOneReceipt: true, authoritativeTaskRead: true, normalOutboxPublishedToRealRedis: true, browserTokenRejectedByRuntime: true })

    phase = 'refresh-and-revocation'
    const refreshResponse = await fetch(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token, resource }) })
    assert.ok(refreshResponse.ok)
    const refreshed = await refreshResponse.json(); assert.ok(refreshed.refresh_token)
    await jwtVerify(refreshed.access_token, jwks, { issuer, audience: resource, algorithms: ['ES256', 'RS256'] })
    assert.equal(requireData(await identity.auth.getUser(refreshed.access_token), 'Refreshed getUser failed').user.id, created.user.id)
    assert.equal((await tool(refreshed.access_token, 'tasks.get', { workspaceId, taskId: createdTask.data.id })).state, 'ok')
    await revokeMcpDelegation(created.user.id, grant.id)
    assert.ok([401, 403].includes((await rpc(refreshed.access_token, 'tools/list')).httpStatus))
    const revoked = await human.auth.oauth.revokeGrant({ clientId }); assert.equal(revoked.error, null)
    const rejectedIdentity = await identity.auth.getUser(refreshed.access_token)
    assert.ok([401, 403].includes(rejectedIdentity.error?.status))
    const afterRevoke = await fetch(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshed.refresh_token }) })
    assert.ok([400, 401, 403].includes(afterRevoke.status))
    assert.equal(requireData(await human.auth.getUser(), 'Browser session was affected').user.id, created.user.id)
    const browserRegression = createClient(base, publicKey, options)
    const freshBrowser = requireData(await browserRegression.auth.signInWithPassword({ email, password }), 'Browser sign-in regression failed')
    const freshBrowserClaims = JSON.parse(Buffer.from(freshBrowser.session.access_token.split('.')[1], 'base64url').toString('utf8'))
    assert.deepEqual(Array.isArray(freshBrowserClaims.aud) ? freshBrowserClaims.aud : [freshBrowserClaims.aud], ['authenticated'])
    assert.equal((await rpc(freshBrowser.session.access_token, 'tools/list')).httpStatus, 401)
    const unchanged = await inspect(authName)
    assert.equal(unchanged.Id, originalId); assert.equal(JSON.stringify(unchanged.Config.Env), originalEnvironment)
    report({ dedicatedAudiencePreservedOnRefresh: true, applicationRevocationDeniedMcp: true, oauthRevocationDeniedAccessAndRefresh: true, browserSessionUnaffected: true, freshBrowserLoginAudiencePreserved: true, existingQaAuthUnchanged: true })
  } catch (error) {
    failed = true
    report({ passed: false, ...safeError(error), status: Number.isInteger(error?.status) ? error.status : undefined, errorCode: typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined, detail: 'Sanitized failure; no token, code, password or connection string is printed' })
  } finally {
    phase = 'owned-resource-cleanup'
    if (proxy) {
      try { await closeServer(proxy); cleanup.proxyClosed = true } catch { failed = true }
    }
    if (redisBridge) {
      try {
        for (const workspaceId of ownedWorkspaces) await redisBridge.command(['DEL', `stream:${workspaceId}`])
        for (const scope of redisScopes) {
          const hash = createHash('sha256').update(scope).digest('hex').slice(0, 16)
          let cursor = '0'
          do { const page = await redisBridge.command(['SCAN', cursor, 'MATCH', `rate:${hash}:*`, 'COUNT', 100]); cursor = page[0]; if (page[1].length) await redisBridge.command(['DEL', ...page[1]]) } while (cursor !== '0')
        }
      } catch { failed = true }
      await redisBridge.close().catch(() => { failed = true })
    }
    if (containerCreated) {
      try { const owned = await inspect(manifest.container); assert.equal(owned.Config.Labels['codex.saathi.mcp.verify'], runId); await command('docker', ['rm', '--force', manifest.container]); cleanup.containerRemoved = true } catch { failed = true }
    }
    if (db) await db.end({ timeout: 5 }).catch(() => {})
    if (applicationDb) await applicationDb.end({ timeout: 5 }).catch(() => {})
    if (adminDb && databaseCreated) {
      try {
        const [owned] = await adminDb`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=${manifest.database}`
        assert.equal(owned.marker, `codex.saathi.mcp.verify=${runId}`)
        await adminDb`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${manifest.database} AND pid<>pg_backend_pid()`
        await adminDb.unsafe(`DROP DATABASE "${manifest.database}" WITH (FORCE)`)
        cleanup.databaseRemoved = true
      } catch { failed = true }
    }
    if (adminDb) await adminDb.end({ timeout: 5 }).catch(() => {})
    report({ manifest, ...cleanup, passed: !failed })
    const evidenceDirectory = resolve(root, '.local-test', `mcp-oauth-${suffix}`)
    await mkdir(evidenceDirectory, { recursive: true })
    await writeFile(resolve(evidenceDirectory, 'result.json'), JSON.stringify({ passed: !failed, manifest, cleanup, evidence }, null, 2) + '\n')
  }
  return !failed
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await verifyMcpLocal() ? 0 : 1
}
