const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

test('usage HTTP route authenticates, delegates actor-scoped reads and preserves public outcomes', async () => {
  let session = null, result = null, failure = false
  const reads = []
  const dependencies = {
    '@/lib/auth-simple': { getSession: async () => session },
    '@/lib/db/client': { getDb: () => async () => [{ user_id: 'actor' }] },
    '@/lib/usage': { getWorkspaceUsage: async (...args) => { reads.push(args); if (failure) throw new Error('private DB details'); return result } },
  }
  const exports = {}
  const js = ts.transpileModule(readFileSync(`${__dirname}/route.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', js)(name => dependencies[name], exports)
  const request = id => new Request(`http://localhost/api/usage${id ? '?workspaceId='+id : ''}`)
  assert.equal((await exports.GET(request('workspace'))).status, 401)
  session = { id: 'actor' }
  assert.equal((await exports.GET(request())).status, 400)
  assert.equal(reads.length, 0)
  assert.equal((await exports.GET(request('workspace'))).status, 403)
  const usage = { taskCreated: 1, taskCompleted: 2, memberAdded: 0, contributors: 2 }
  result = usage
  const response = await exports.GET(request('workspace'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { workspaceId: 'workspace', usage })
  assert.deepEqual(reads, [['workspace', 'actor'], ['workspace', 'actor']])
  failure = true
  const unavailable = await exports.GET(request('workspace'))
  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), { error: 'Service unavailable' })
})
