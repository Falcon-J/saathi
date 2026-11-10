const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")
const ts = require('typescript')

test("Next.js authentication boundary uses the proxy convention", () => {
  assert.equal(fs.existsSync("proxy.ts"), true)
  assert.equal(fs.existsSync("middleware.ts"), false)
  assert.match(fs.readFileSync("proxy.ts", "utf8"), /export async function proxy/)
})

function load(filename, dependencies) {
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', js)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports)
  return exports
}

test('login distinguishes authentication service failures from invalid credentials', async () => {
  let failure
  const auth = load('lib/auth-simple.ts', {
    'next/headers': {}, './supabase/server': { createClient: async () => ({ auth: { signInWithPassword: async () => ({ data: { user: null }, error: failure }) } }) },
    './supabase/config': {}, './supabase/auth-boundary': {}, './data/profiles': {}, './identity': { normalizeEmail: value => value.trim().toLowerCase() },
  })
  for (const error of [{ status: 504, code: 'request_timeout' }, { status: 503 }, { status: 429 }, {}]) {
    failure = error
    assert.deepEqual(await auth.login('user@example.test', 'password'), { error: 'Account service is temporarily unavailable. Please try again.' })
  }
  failure = { status: 400, code: 'invalid_credentials' }
  assert.deepEqual(await auth.login('user@example.test', 'password'), { error: 'Unable to sign in. Check your email and password.' })
})

test('signup starts a session immediately when the Auth provider enables automatic confirmation', async () => {
  const auth = load('lib/auth-simple.ts', {
    'next/headers': {}, './supabase/server': { createClient: async () => ({ auth: { signUp: async () => ({ data: { user: { email_confirmed_at: 'provider-confirmed' }, session: {} }, error: null }) } }) },
    './supabase/config': { getAuthCallbackUrl: () => 'https://example.test/auth/callback' }, './supabase/auth-boundary': { validateCredentials: () => null, safeAuthRedirect: () => '/dashboard' }, './data/profiles': {}, './identity': { normalizeEmail: value => value.trim().toLowerCase() },
  })
  assert.deepEqual(await auth.signup('person@example.test', 'Person', 'password123'), { success: true })
})

test('settings action returns safe conflict and failure results without exposing internal errors', async () => {
  let failure = new Error('Workspace changed. Refresh and try again.')
  const actions = load('app/actions/workspaces.ts', {
    '@/lib/auth-simple': { getSession: async () => ({ id: 'owner' }) }, '@/lib/post-commit': { afterDomainCommit() {} },
    '@/lib/identity': {}, '@/lib/invitation-domain': {}, '@/lib/data/workspaces': { updateWorkspaceRecord: async () => { throw failure } },
  })
  assert.deepEqual(await actions.updateWorkspaceSettings('workspace', {}, 1), { error: 'Workspace changed. Refresh and try again.' })
  failure = new Error('private database details')
  assert.deepEqual(await actions.updateWorkspaceSettings('workspace', {}, 1), { error: 'Unable to save workspace settings. Please try again.' })
})
function fixture({ path = '/dashboard', method = 'GET', action, canonicalEntry = null, onCanonicalEntry = () => {}, user = { id: 'actor', email: 'actor@example.test', email_confirmed_at: 'confirmed' }, error = null, sessionError = null, refresh = false, sessionThrows = false, clientFactory } = {}) {
  const cookies = new Map(), calls = { user: 0, session: 0 }
  const jar = { getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })), set: (name, value) => cookies.set(name, value) }
  class NextResponse {
    constructor(body, options = {}) { this.body = body; this.status = options.status ?? 200; this.headers = new Headers(options.headers); const values = new Map(); this.cookies = { set: (name, value, options) => { if (typeof name === 'object') values.set(name.name, name); else values.set(name, { name, value, ...options }) }, getAll: () => [...values.values()] } }
    static next({ request }) { const result = new NextResponse(); result.request = request; return result }
    static redirect(url) { return new NextResponse(null, { status: 307, headers: { location: String(url) } }) }
    static json(body, options) { return new NextResponse(body, options) }
  }
  const headers = new Headers()
  if (action !== undefined) headers.set('Next-Action', action)
  const request = { method, headers, cookies: jar, url: `https://example.test${path}`, nextUrl: new URL(`https://example.test${path}`) }
  const refreshCookies = options => { if (refresh) options.cookies.setAll([{ name: 'auth-cookie', value: 'refreshed', options: { httpOnly: true, sameSite: 'lax' } }]) }
  const client = options => ({ auth: {
    getUser: async () => { calls.user++; refreshCookies(options); return { data: { user }, error } },
    getSession: async () => { calls.session++; refreshCookies(options); if (sessionThrows) throw new Error('Malformed token'); return { data: sessionError ? null : { session: { sub: 'untrusted-for-authorization' } }, error: sessionError } },
  } })
  const proxy = load('proxy.ts', { '@supabase/ssr': { createServerClient: (_url, _key, options) => clientFactory ? clientFactory(options) : client(options) }, 'next/server': { NextResponse }, './lib/supabase/config': { getCanonicalAuthEntryUrl: (...args) => { onCanonicalEntry(...args); return canonicalEntry }, getSupabaseConfig: () => ({ url: 'https://auth.example.test', key: 'public-placeholder' }) } }).proxy
  return { proxy: () => proxy(request), request, calls, client, NextResponse }
}

for (const expired of [false, true]) test(`symmetric ${expired ? 'expired' : 'fresh'} sessions perform one live identity request across proxy and action`, async () => {
  const { createServerClient } = require('@supabase/ssr')
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'actor@example.test', email_confirmed_at: '2026-11-08', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-08' }
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp })}.${encode('test-signature')}`
  const oldExp = expired ? Math.floor(Date.now() / 1000) - 120 : exp
  const oldToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: oldExp })}.${encode('test-signature')}`
  let userRequests = 0, tokenRequests = 0
  const clientFactory = options => createServerClient('https://auth.example.test', 'public-placeholder', { ...options, global: { fetch: async url => {
    if (new URL(url).pathname === '/auth/v1/token') {
      tokenRequests++
      return Response.json({ access_token: token, refresh_token: 'refreshed-token', expires_at: exp, expires_in: 3600, token_type: 'bearer', user })
    }
    assert.equal(new URL(url).pathname, '/auth/v1/user')
    userRequests++
    return Response.json(user)
  } } })
  const ui = fixture({ method: 'POST', action: 'read-task-graph', clientFactory })
  const original = `base64-${encode({ access_token: oldToken, refresh_token: 'test-refresh', expires_at: oldExp, expires_in: 3600, token_type: 'bearer', user })}`
  ui.request.cookies.set('sb-auth-auth-token', original)
  const response = await ui.proxy()
  assert.equal(tokenRequests, expired ? 1 : 0)
  if (expired) {
    assert.notEqual(ui.request.cookies.getAll()[0].value, original)
    assert.deepEqual(response.cookies.getAll().map(({ name, value }) => ({ name, value })), ui.request.cookies.getAll())
  }
  const auth = load('lib/auth-simple.ts', {
    'next/headers': {}, './supabase/server': { createClient: async () => clientFactory({ cookies: { getAll: () => ui.request.cookies.getAll(), setAll() {} } }) },
    './supabase/config': {}, './supabase/auth-boundary': require('./lib/supabase/auth-boundary.ts'), './data/profiles': {}, './identity': {},
  })
  assert.deepEqual(await auth.getVerifiedActor(), { id: user.id, email: user.email })
  assert.equal(userRequests, 1, 'cookie maintenance must not duplicate the action live identity check')
})

test('auth entry redirects before issuing PKCE cookies or calling Auth', async () => {
  const ui = fixture({ path: '/login', canonicalEntry: new URL('https://canonical.example/login') })
  const response = await ui.proxy()
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), 'https://canonical.example/login')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(ui.calls, { user: 0, session: 0 })
  assert.equal(response.cookies.getAll().length, 0)
})

test('auth entry compares browser Host rather than a forwarded host or normalized URL', async () => {
  let compared
  const ui = fixture({ path: '/login', onCanonicalEntry: (...args) => { compared = args } })
  ui.request.url = 'http://localhost:3100/login'
  ui.request.headers.set('host', '127.0.0.1:3100')
  ui.request.headers.set('x-forwarded-host', 'untrusted.example')
  await ui.proxy()
  assert.deepEqual(compared, ['http://localhost:3100/login', '127.0.0.1:3100'])
})

for (const input of [{ method: 'POST', action: 'actual-action' }, { path: '/api/users' }, { path: '/api/realtime?workspaceId=fixture' }]) {
  test(`proxy refreshes cookies once without live authorization for ${JSON.stringify(input)}`, async () => {
    const ui = fixture(input), response = await ui.proxy()
    assert.equal(response.status, 200)
    assert.deepEqual(ui.calls, { user: 0, session: 1 })
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  })
}

for (const action of [undefined, 'forged-header', '']) {
  test(`protected GET retains live user checks even with action header ${JSON.stringify(action)}`, async () => {
    const ui = fixture({ action, user: null, error: { status: 401 } }), response = await ui.proxy()
    assert.deepEqual(ui.calls, { user: 1, session: 0 })
    assert.equal(response.status, 307)
    assert.match(response.headers.get('location'), /\/login\?redirect=%2Fdashboard/)
  })
}

test('protected page GET preserves confirmation checks, outages and refreshed redirect cookies', async () => {
  assert.equal((await fixture({ error: { status: 503 } }).proxy()).status, 503)
  assert.equal((await fixture({ user: { id: 'actor' } }).proxy()).status, 307)
  const ui = fixture({ user: null, error: { status: 401 }, refresh: true }), response = await ui.proxy()
  assert.equal(response.cookies.getAll()[0].value, 'refreshed')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
})

test('session refresh propagates cookies to the downstream request and browser response', async () => {
  const ui = fixture({ method: 'POST', action: 'actual-action', refresh: true }), response = await ui.proxy()
  assert.deepEqual(ui.request.cookies.getAll(), [{ name: 'auth-cookie', value: 'refreshed' }])
  assert.deepEqual(response.cookies.getAll(), [{ name: 'auth-cookie', value: 'refreshed', httpOnly: true, sameSite: 'lax' }])
})

test('blank action POST headers retain the protected page boundary', async () => {
  for (const action of [undefined, '', '   ']) {
    const ui = fixture({ method: 'POST', action, user: null, error: { status: 401 } })
    assert.equal((await ui.proxy()).status, 307)
    assert.deepEqual(ui.calls, { user: 1, session: 0 })
  }
})

for (const boundary of ['api', 'action']) for (const failure of [{ sessionError: { status: 401, name: 'MalformedToken' } }, { sessionError: { status: 401, name: 'ExpiredToken' } }, {}, { sessionThrows: true }]) {
  test(`downstream ${boundary} live authorization rejects ${failure.sessionError?.name ?? (failure.sessionThrows ? 'thrown session parsing failure' : 'unverified session for a revoked user')}`, async () => {
    const ui = fixture({ ...(boundary === 'api' ? { path: '/api/users' } : { method: 'POST', action: 'actual-action' }), ...failure, user: null, error: { status: 401 } })
    const response = await ui.proxy()
    assert.equal(response.status, 200, 'session contents are refresh-only; the handler owns authorization')
    assert.deepEqual(ui.calls, { user: 0, session: 1 })
    const auth = load('lib/auth-simple.ts', {
      'next/headers': {}, './supabase/server': { createClient: async () => ui.client({ cookies: { setAll() {} } }) }, './supabase/config': {},
      './supabase/auth-boundary': { resolveVerifiedSession: () => assert.fail('failed live authentication must not resolve an identity') }, './data/profiles': {}, './identity': {},
    })
    if (boundary === 'api') {
      const route = load('app/api/users/route.ts', { 'next/server': { NextResponse: ui.NextResponse }, '@/lib/auth-simple': auth, '@/lib/data/profiles': {}, '@/lib/supabase/auth-boundary': {} })
      assert.equal((await route.GET()).status, 401)
    } else {
      class TaskError extends Error { constructor(message, code) { super(message); this.code = code } }
      const action = load('app/tasks/actions.ts', { '@/lib/auth-simple': auth, '@/lib/data/tasks': { TaskError, listTaskRecordsPage: () => assert.fail('failed live auth must not read tasks') }, '@/lib/post-commit': {}, '@/lib/rate-limit': {}, '@/lib/env': {} })
      const denied = await action.getTasksPage('workspace')
      assert.equal(denied.code, 'unauthenticated')
      assert.equal(denied.tasks, undefined)
    }
    assert.deepEqual(ui.calls, { user: 1, session: 1 })
  })
}
