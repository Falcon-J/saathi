const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function makeFixture() {
  let now = 60000, offline = false
  const counts = new Map(), expiries = new Map()
  const increment = key => { const value = (counts.get(key) ?? 0) + 1; counts.set(key, value); return value }
  const redis = {
    async incr(key) { if (offline) throw new Error('Redis unavailable'); return increment(key) },
    async set(key, value, options) { if (offline) throw new Error('Redis unavailable'); await new Promise(resolve => setImmediate(resolve)); counts.set(key, value); expiries.set(key, options.ex) },
    async incrementWithExpiry(key, seconds) {
      if (offline) throw new Error('Redis unavailable')
      const count = increment(key)
      if (count === 1) expiries.set(key, seconds)
      return count
    },
  }
  const deps = { crypto: require('node:crypto'), './redis.ts': { redis } }, exports = {}
  const js = ts.transpileModule(fs.readFileSync('lib/rate-limit.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'exports', 'Date', js)(name => deps[name], exports, class extends Date { static now() { return now } })
  return { ...exports, counts, expiries, outage() { offline = true }, advance(ms) { now += ms } }
}

test('concurrent first-window requests cannot reset another request count', async () => {
  const fixture = makeFixture()
  const limit = () => fixture.consumeDistributedRateLimit('concurrent', 2, 60000)
  await Promise.all([limit(), limit()])
  await assert.rejects(limit, error => error instanceof fixture.RateLimitExceeded)
  assert.deepEqual([...fixture.counts.values()], [3])
})

test('a dependency failure rejects admission rather than allowing an uncounted request', async () => {
  const fixture = makeFixture()
  fixture.outage()
  await assert.rejects(() => fixture.consumeDistributedRateLimit('offline', 2, 60000), /Redis unavailable/)
})

test('new fixed windows admit independently and retain expiring counters', async () => {
  const fixture = makeFixture()
  await fixture.consumeDistributedRateLimit('window', 1, 60000)
  fixture.advance(59000)
  await assert.rejects(() => fixture.consumeDistributedRateLimit('window', 1, 60000), error => error.retryAfterSeconds === 1)
  fixture.advance(1000)
  await fixture.consumeDistributedRateLimit('window', 1, 60000)
  assert.equal(fixture.counts.size, 2)
  assert.deepEqual([...fixture.expiries.values()], [61, 61])
})
