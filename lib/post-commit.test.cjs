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
  const queued = [], exports = {}
  const dependencies = {
    'next/server': { after: schedule ?? (callback => queued.push(callback)) },
    'next/cache': { revalidatePath() {} },
    './data/events': { flushOutbox: flush },
  }
  const js = ts.transpileModule(fs.readFileSync('lib/post-commit.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', 'console', js)(name => dependencies[name], exports, { warn() {} })
  return { queued, commit: exports.afterDomainCommit }
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

test('commits during every flush coalesce within the existing four-batch budget', async () => {
  let calls = 0
  const ui = fixture(async () => { calls++; ui.commit('workspace'); return { attempted: 1, failed: 0, unavailable: false } })
  ui.commit('workspace'); ui.commit('workspace')
  await ui.queued[0]()
  assert.equal(calls, 4)
  assert.equal(ui.queued.length, 1)
  ui.commit('workspace')
  assert.equal(ui.queued.length, 2, 'budget exhaustion releases scheduling for later commits')
})

for (const failure of [{ attempted: 1, failed: 1, unavailable: false }, { attempted: 0, failed: 0, unavailable: true }]) {
  test(`publication ${failure.unavailable ? 'unavailability' : 'failure'} stops retries and releases the workspace`, async () => {
    let calls = 0
    const ui = fixture(async () => { calls++; ui.commit('workspace'); return failure })
    ui.commit('workspace'); await ui.queued[0]()
    assert.equal(calls, 1, 'failed delivery stays with the retry worker')
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
