const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

test('readiness probes database then Redis and logs only the failed dependency', async () => {
  let databaseFailure = false, redisResult = true, redisFailure = false
  const probes = [], failures = []
  const dependencies = {
    '@/lib/db/client': { getDb: () => async query => {
      probes.push(['database', query.join('')])
      if (databaseFailure) throw new Error('private database credentials')
    } },
    '@/lib/redis': { redis: { ping: async () => {
      probes.push(['redis'])
      if (redisFailure) throw new Error('private Redis URL')
      return redisResult
    } } },
  }
  const exports = {}
  const js = ts.transpileModule(readFileSync(`${__dirname}/route.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', 'console', js)(name => dependencies[name], exports, { error: (...args) => failures.push(args) })
  const assertResponse = async (status, body) => {
    const response = await exports.GET()
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { status: body })
  }

  await assertResponse(200, 'ready')
  assert.deepEqual(probes, [['database', 'SELECT 1'], ['redis']])
  assert.deepEqual(failures, [])

  probes.length = 0
  databaseFailure = true
  await assertResponse(503, 'not_ready')
  assert.deepEqual(probes, [['database', 'SELECT 1']], 'Redis must not run after database failure')
  assert.deepEqual(failures, [['[Saathi] Readiness dependency failed:', 'database']])

  databaseFailure = false
  redisResult = false
  await assertResponse(503, 'not_ready')
  redisFailure = true
  await assertResponse(503, 'not_ready')
  assert.deepEqual(failures.slice(1), [
    ['[Saathi] Readiness dependency failed:', 'redis'],
    ['[Saathi] Readiness dependency failed:', 'redis'],
  ])
})
