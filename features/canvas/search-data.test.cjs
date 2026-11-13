const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

const actorId = '10000000-0000-4000-8000-000000000001'
const workspaceA = '20000000-0000-4000-8000-000000000001'
const workspaceB = '20000000-0000-4000-8000-000000000002'
const section = '30000000-0000-4000-8000-000000000001'
const attachment = '30000000-0000-4000-8000-000000000002'
const taskId = '40000000-0000-4000-8000-000000000001'

function load(path, dependencies) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  new Function('require', 'exports', code)(name => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  }, exports)
  return exports
}

function fixture({ authorized = [workspaceB], resources = [], aclError } = {}) {
  const calls = []
  const tx = (strings, ...values) => {
    if (Array.isArray(strings) && !Object.hasOwn(strings, 'raw')) {
      calls.push(['ids', [...strings]])
      return { authorizedIds: [...strings] }
    }
    const sql = strings.join('?')
    calls.push(['sql', sql, values])
    if (sql.includes('SELECT w.id')) return Promise.resolve([{ id: workspaceA }, { id: workspaceB }])
    assert.match(sql, /LIMIT 20/)
    assert.match(sql, /position\(\? in lower\(t\.title\)\)/)
    assert.ok(!/ILIKE|LIKE/.test(sql), 'wildcards cannot expand a literal search')
    return Promise.resolve([{ id: taskId, title: 'Literal %_ task', workspace_id: workspaceB, workspace_name: 'Delivery', private_payload: 'must not escape' }])
  }
  const dependencies = {
    '../../lib/db/client.ts': { getDb: () => ({ begin: async (isolation, read) => {
      calls.push(['begin', isolation])
      return read(tx)
    } }) },
    '../access/service.ts': {
      filterWorkspaces: async (actor, rows, capability, snapshot) => {
        assert.equal(actor, actorId)
        assert.equal(capability, 'read')
        assert.equal(snapshot, tx)
        calls.push(['acl', rows.map(row => row.id)])
        if (aclError) throw aclError
        return rows.filter(row => authorized.includes(row.id))
      },
      getAuthorizedCanvasView: async (actor, snapshot) => {
        assert.equal(actor, actorId)
        assert.equal(snapshot, tx)
        calls.push(['resources'])
        return { resources, references: [] }
      },
    },
    './search.ts': require('./search.ts'),
  }
  return { ...load('features/canvas/search-data.ts', dependencies), calls }
}

test('canvas search uses membership and section read access in the same snapshot before returning a minimal bounded result', async () => {
  const read = fixture()
  assert.deepEqual(await read.searchCanvasRecords(actorId, { query: '  %_  ' }), [{
    id: taskId, title: 'Literal %_ task', workspaceId: workspaceB, workspaceName: 'Delivery',
  }])
  assert.deepEqual(read.calls[0], ['begin', 'isolation level repeatable read read only'])
  assert.deepEqual(read.calls.find(call => call[0] === 'ids'), ['ids', [workspaceB]])
  const searches = read.calls.filter(call => call[0] === 'sql' && call[1].includes('SELECT t.id'))
  assert.equal(searches.length, 1)
  assert.deepEqual(searches[0][2].slice(1), ['%_', '%_'])
  assert.equal(read.calls.some(call => call[0] === 'resources'), false)
})

test('revoked membership or section scope cannot dispatch a task search', async () => {
  const reads = [
    [fixture({ authorized: [] }), { query: 'handoff' }],
    [fixture(), { query: 'handoff', resourceId: section }],
    [fixture({ resources: [{ id: section, parentId: null }, { id: attachment, parentId: section, workspaceId: workspaceA }] }), { query: 'handoff', resourceId: section }],
  ]
  for (const [read, input] of reads) {
    assert.deepEqual(await read.searchCanvasRecords(actorId, input), [])
    assert.equal(read.calls.some(call => call[0] === 'sql' && call[1].includes('SELECT t.id')), false)
  }
})

test('authorized resource search intersects canonical descendants with current workspace membership', async () => {
  const read = fixture({ resources: [
    { id: section, parentId: null },
    { id: attachment, parentId: section, workspaceId: workspaceB },
    { id: '30000000-0000-4000-8000-000000000003', parentId: null, workspaceId: workspaceA },
  ] })
  await read.searchCanvasRecords(actorId, { query: 'handoff', resourceId: section })
  assert.deepEqual(read.calls.find(call => call[0] === 'ids'), ['ids', [workspaceB]])
  assert.equal(read.calls.filter(call => call[0] === 'resources').length, 1)
})

test('invalid or forged search scopes fail before touching the database and policy failures stay closed', async () => {
  const invalid = fixture()
  for (const input of [{ query: 'x' }, { query: 'x'.repeat(121) }, { query: 'ok', workspaceIds: [workspaceA] }, { query: 'ok', resourceId: 'not-a-uuid' }]) {
    await assert.rejects(invalid.searchCanvasRecords(actorId, input))
  }
  assert.deepEqual(invalid.calls, [])
  const denied = fixture({ aclError: new Error('policy unavailable') })
  await assert.rejects(denied.searchCanvasRecords(actorId, { query: 'handoff' }), /policy unavailable/)
  assert.equal(denied.calls.some(call => call[0] === 'sql' && call[1].includes('SELECT t.id')), false)
})

function actionFixture({ session = { id: actorId }, failure } = {}) {
  const calls = []
  return { calls, ...load('app/actions/canvas-search.ts', {
    '@/lib/auth-simple': { getSession: async () => session },
    '@/features/canvas/search-data': { searchCanvasRecords: async (actor, input) => {
      calls.push({ actor, input })
      if (failure) throw failure
      return []
    } },
  }) }
}

test('browser search derives identity from the live session and never trusts a caller actor', async () => {
  const input = { query: 'handoff' }
  const signedIn = actionFixture()
  assert.deepEqual(await signedIn.searchCanvas(input), { items: [] })
  assert.deepEqual(signedIn.calls, [{ actor: actorId, input }])
  const signedOut = actionFixture({ session: null })
  assert.match((await signedOut.searchCanvas(input)).error, /Sign in/)
  assert.deepEqual(signedOut.calls, [])
})

test('browser search distinguishes unavailable reads from empty success without exposing internal diagnostics', async () => {
  const failed = actionFixture({ failure: new Error('private database connection details') })
  const result = await failed.searchCanvas({ query: 'handoff' })
  assert.deepEqual(result, { error: 'Search unavailable. Try again.' })
  assert.equal('items' in result, false)
})
