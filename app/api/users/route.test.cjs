const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function fixture() {
  const calls = []
  const session = { id: 'current-user', email: 'own@example.test', username: 'Current' }
  const deps = {
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    '@/lib/auth-simple': { getSession: async () => session },
    '@/lib/data/profiles': { updateProfileUsername: async (id, name) => { calls.push([id, name]); return { id, username: name } } },
    '@/lib/supabase/auth-boundary': { isSameOrigin: (origin, url) => origin === new URL(url).origin, validateUsername: name => typeof name === 'string' && name.trim() ? null : 'Username required' },
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('app/api/users/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', js)(name => { assert.ok(name in deps, name); return deps[name] }, exports)
  return { ...exports, calls, session }
}

test('account API returns only current user, independent of supplied workspace or user identifiers', async () => {
  const route = fixture()
  const response = await route.GET(new Request('https://app.example/api/users?workspaceId=restricted&userId=other'))
  assert.deepEqual(await response.json(), { user: route.session })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})

test('account profile updates cannot substitute another actor and reject cross-origin requests', async () => {
  const route = fixture()
  const request = origin => new Request('https://app.example/api/users', { method: 'PUT', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ' Renamed ', id: 'other', userId: 'other', workspaceId: 'restricted' }) })
  assert.equal((await route.PUT(request('https://evil.example'))).status, 403)
  assert.deepEqual(route.calls, [])
  assert.equal((await route.PUT(request('https://app.example'))).status, 200)
  assert.deepEqual(route.calls, [['current-user', 'Renamed']])
})
