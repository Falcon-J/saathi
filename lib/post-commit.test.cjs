const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

test('post-commit returns before delivery and keeps failure out of command outcomes', async () => {
  let deliveries = 0
  const queued = []
  const dependencies = {
    'next/server': { after: callback => queued.push(callback) },
    'next/cache': { revalidatePath: () => { throw new Error('Cache unavailable') } },
    './data/events': { flushOutbox: async () => { deliveries++; throw new Error('Provider unavailable') } },
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('lib/post-commit.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', 'console', js)(name => dependencies[name], exports, { warn() {} })
  exports.afterDomainCommit('workspace')
  exports.afterDomainCommit('workspace')
  assert.equal(deliveries, 0)
  assert.equal(queued.length, 1, 'CSV writes share one delivery callback per workspace')
  await queued[0]()
  assert.equal(deliveries, 1)
  exports.afterDomainCommit('workspace')
  assert.equal(queued.length, 2, 'delivery failure does not block later writes')
})

function fixture(flush, schedule) {
  const queued = [], exports = {}, refreshes = []
  const dependencies = {
    'next/server': { after: schedule ?? (callback => queued.push(callback)) },
    'next/cache': { revalidatePath: path => refreshes.push(path) },
    './data/events': { flushOutbox: flush },
  }
  const js = ts.transpileModule(fs.readFileSync('lib/post-commit.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', 'console', js)(name => dependencies[name], exports, { warn() {} })
  return { queued, refreshes, commit: exports.afterDomainCommit }
}

for (const attempted of [0, 1]) {
  test(`a commit during an active ${attempted}-row flush schedules another claim`, async () => {
    let resolve, calls = 0
    const first = new Promise(done => { resolve = done })
    const ui = fixture(async () => { calls++; return calls === 1 ? first : { attempted: 0, failed: 0, unavailable: false } })
    ui.commit('workspace')
    const callback = ui.queued[0]()
    assert.equal(calls, 1)
    ui.commit('workspace')
    assert.equal(ui.queued.length, 1, 'in-flight writes share the existing callback')
    resolve({ attempted, failed: 0, unavailable: false })
    await callback
    assert.equal(calls, 2, 'a write after the first claim must trigger another claim')
  })
}

test('commits during every flush hand off pending delivery within each four-batch budget', async () => {
  let calls = 0
  const ui = fixture(async () => { calls++; if (calls <= 4) ui.commit('workspace'); return { attempted: calls <= 4 ? 1 : 0, failed: 0, unavailable: false } })
  ui.commit('workspace'); ui.commit('workspace')
  await ui.queued[0]()
  assert.equal(calls, 4)
  assert.equal(ui.queued.length, 2, 'pending delivery must continue without another domain write')
  ui.commit('workspace')
  assert.equal(ui.queued.length, 2, 'writes before the handoff callback starts still coalesce into its map entry')
  const refreshes = ui.refreshes.length
  await ui.queued[1]()
  assert.equal(calls, 5)
  assert.equal(ui.queued.length, 2, 'an empty healthy claim ends the handoff chain')
  assert.equal(ui.refreshes.length, refreshes, 'internal handoffs do not invalidate the cache again')
  ui.commit('workspace')
  assert.equal(ui.queued.length, 3, 'healthy idle completion releases the workspace map')
})

test('a commit during the fourth flush retains its wakeup across the callback boundary', async () => {
  let calls = 0, resolve
  const fourth = new Promise(done => { resolve = done })
  const ui = fixture(async () => {
    calls++
    return calls === 4 ? fourth : { attempted: calls < 4 ? 25 : 0, failed: 0, unavailable: false }
  })
  ui.commit('workspace')
  const running = ui.queued[0]()
  // Each flush awaits; allow the first three completed claims to advance.
  while (calls < 4) await Promise.resolve()
  ui.commit('workspace')
  resolve({ attempted: 1, failed: 0, unavailable: false })
  await running
  assert.equal(calls, 4)
  assert.equal(ui.queued.length, 2)
  await ui.queued[1]()
  assert.equal(calls, 5, 'the pending commit is claimed without a later write')
  assert.equal(ui.queued.length, 2)
  ui.commit('workspace')
  assert.equal(ui.queued.length, 3)
})

test('a saturated fourth batch drains older healthy backlog without any later commit', async () => {
  let calls = 0
  const ui = fixture(async () => { calls++; return { attempted: calls <= 8 ? 25 : 0, failed: 0, unavailable: false } })
  ui.commit('workspace')
  await ui.queued[0]()
  assert.equal(calls, 4)
  assert.equal(ui.queued.length, 2)
  await ui.queued[1]()
  assert.equal(calls, 8, 'each callback is limited to four claims')
  assert.equal(ui.queued.length, 3)
  await ui.queued[2]()
  assert.equal(calls, 9)
  assert.equal(ui.queued.length, 3, 'no-data completion cannot hot loop')
  assert.equal(ui.refreshes.length, 1)
  ui.commit('workspace')
  assert.equal(ui.queued.length, 4)
})

for (const failure of [{ attempted: 1, failed: 1, unavailable: false }, { attempted: 0, failed: 0, unavailable: true }]) {
  test(`publication ${failure.unavailable ? 'unavailability' : 'failure'} stops retries and releases the workspace`, async () => {
    let calls = 0
    const ui = fixture(async () => { calls++; ui.commit('workspace'); return failure })
    ui.commit('workspace'); await ui.queued[0]()
    assert.equal(calls, 1, 'failed delivery stays with the retry worker')
    assert.equal(ui.queued.length, 1, 'failures never hand off into a hot loop')
    ui.commit('workspace'); assert.equal(ui.queued.length, 2)
  })
}

test('scheduling failure releases the workspace without failing the committed command', () => {
  let scheduling = 0
  const ui = fixture(async () => assert.fail('delivery must not run synchronously'), () => { scheduling++; throw new Error('Unavailable') })
  assert.doesNotThrow(() => ui.commit('workspace'))
  assert.doesNotThrow(() => ui.commit('workspace'))
  assert.equal(scheduling, 2)
})

test('failure after a healthy handoff stops the chain and releases later scheduling', async () => {
  let calls = 0
  const ui = fixture(async () => {
    calls++
    if (calls === 5) throw new Error('Private provider failure')
    return { attempted: 25, failed: 0, unavailable: false }
  })
  ui.commit('workspace')
  await ui.queued[0]()
  assert.equal(ui.queued.length, 2)
  await ui.queued[1]()
  assert.equal(calls, 5)
  assert.equal(ui.queued.length, 2)
  ui.commit('workspace')
  assert.equal(ui.queued.length, 3)
})

test('nested scheduling failure does not loop or retain the workspace map', async () => {
  let scheduling = 0, calls = 0
  const callbacks = []
  const ui = fixture(async () => { calls++; return { attempted: 25, failed: 0, unavailable: false } }, callback => {
    scheduling++
    if (scheduling === 2) throw new Error('Private scheduling failure')
    callbacks.push(callback)
  })
  ui.commit('workspace')
  await callbacks[0]()
  assert.equal(calls, 4)
  assert.equal(scheduling, 2)
  ui.commit('workspace')
  assert.equal(scheduling, 3)
  assert.equal(callbacks.length, 2)
})
