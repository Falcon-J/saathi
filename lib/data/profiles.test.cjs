const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

function load(query, messages = []) {
  const exports = {}
  const source = ts.transpileModule(readFileSync('lib/data/profiles.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', 'console', source)(() => ({ getDb: () => query }), exports, { info: value => messages.push(JSON.parse(value)) })
  return exports
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

test('concurrent profile reads share one query, but later reads reflect current data', async () => {
  let reads = 0
  const first = deferred()
  const profile = load(async (_sql, id) => { reads++; return reads === 1 ? first.promise : [{ id, username: 'Updated' }] })
  const pending = Array.from({ length: 200 }, () => profile.getProfile('actor'))
  assert.equal(reads, 1)
  first.resolve([{ id: 'actor', username: 'Original' }])
  assert.ok((await Promise.all(pending)).every(row => row.username === 'Original'))
  assert.equal((await profile.getProfile('actor')).username, 'Updated')
  assert.equal(reads, 2)
})

test('different profiles are isolated and failed reads allow retry', async () => {
  let reads = 0
  const profile = load(async (_sql, id) => { if (++reads === 1) throw new Error('Unavailable'); return [{ id, username: id }] })
  await assert.rejects(profile.getProfile('one'), /Unavailable/)
  assert.deepEqual((await Promise.all([profile.getProfile('one'), profile.getProfile('two')])).map(row => row.id), ['one', 'two'])
  assert.equal(reads, 3)
})

test('a committed profile update invalidates earlier reads without evicting a newer in-flight read', async () => {
  const old = deferred(), fresh = deferred()
  let reads = 0
  const profile = load(async (sql, value, id) => {
    if (sql[0].startsWith('update')) return [{ id, username: value }]
    return ++reads === 1 ? old.promise : fresh.promise
  })
  const earlier = profile.getProfile('actor')
  await profile.updateProfileUsername('actor', 'Updated')
  const newer = profile.getProfile('actor')
  assert.equal(reads, 2)
  old.resolve([{ id: 'actor', username: 'Original' }]); await earlier
  const shared = profile.getProfile('actor')
  assert.equal(reads, 2)
  fresh.resolve([{ id: 'actor', username: 'Updated' }])
  assert.equal((await newer).username, 'Updated')
  assert.equal((await shared).username, 'Updated')
})

test('profile diagnostics split reservation and query timing and release successful or failed reads', async () => {
  const original = process.env.SSE_PERFORMANCE_DIAGNOSTICS
  process.env.SSE_PERFORMANCE_DIAGNOSTICS = '1'
  try {
    for (const fails of [false, true]) {
      let reserved = 0, reads = 0, released = 0
      const messages = []
      const connection = async (_sql, id) => { reads++; if (fails) throw new Error('Private database failure'); return [{ id, username: 'Read' }] }
      connection.release = () => { released++ }
      const query = () => assert.fail('diagnostics must use the reserved connection')
      query.reserve = async () => { reserved++; return connection }
      const profile = load(query, messages)
      const results = await Promise.allSettled([profile.getProfile('private-actor-id'), profile.getProfile('private-actor-id')])
      assert.equal(results[0].status, fails ? 'rejected' : 'fulfilled')
      assert.equal(reserved, 1)
      assert.equal(reads, 1)
      assert.equal(released, 1)
      assert.equal(messages.length, 1)
      assert.equal(messages[0].ssePhase, 'profile-database')
      assert.ok(messages[0].poolWaitMs >= 0)
      assert.ok(messages[0].queryMs >= 0)
      assert.equal(messages[0].success, !fails)
      assert.doesNotMatch(JSON.stringify(messages), /private-actor-id|Private database failure|SELECT|username/)
    }
  } finally {
    if (original === undefined) delete process.env.SSE_PERFORMANCE_DIAGNOSTICS
    else process.env.SSE_PERFORMANCE_DIAGNOSTICS = original
  }
})
