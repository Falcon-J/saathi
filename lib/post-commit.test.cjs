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
