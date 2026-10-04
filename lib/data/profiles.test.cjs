const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

function load(query) {
  const exports = {}
  const source = ts.transpileModule(readFileSync('lib/data/profiles.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', source)(() => ({ getDb: () => query }), exports)
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
