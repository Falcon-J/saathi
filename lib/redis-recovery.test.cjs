const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function adapter() {
  let offline = false
  const values = new Map()
  class Redis {
    async set(key, value) { if (offline) throw new Error('Unavailable'); values.set(key, value); return 'OK' }
    async get(key) { if (offline) throw new Error('Unavailable'); return values.get(key) ?? null }
    async ping() { if (offline) throw new Error('Unavailable'); return 'PONG' }
    async eval() { if (offline) throw new Error('Unavailable'); return 1 }
  }
  const deps = {
    '@upstash/redis': { Redis },
    './env.ts': { env: { NODE_ENV: 'production' }, getRedisConfig: () => ({ url: 'https://redis.test', token: 'fixture' }) },
    './redis-policy.ts': { shouldUseMockRedis: () => false },
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('lib/redis.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', 'console', 'setTimeout', js)(name => deps[name], exports, { log() {}, warn() {}, error() {} }, callback => { callback(); return { unref() {} } })
  return { redis: exports.redis, outage(value) { offline = value } }
}

test('configured Redis retries after an outage without falling back to mock storage', async () => {
  const fixture = adapter()
  fixture.outage(true)
  await assert.rejects(fixture.redis.set('owned-key', 'value'), /Redis unavailable/)
  assert.equal(fixture.redis.getStatus().type, 'unavailable')
  fixture.outage(false)
  await fixture.redis.set('owned-key', 'recovered')
  assert.equal(await fixture.redis.get('owned-key'), 'recovered')
  assert.equal(fixture.redis.getStatus().type, 'redis')
})

test('health probes can recover a configured adapter after a failed ping', async () => {
  const fixture = adapter()
  fixture.outage(true)
  assert.equal(await fixture.redis.ping(), false)
  fixture.outage(false)
  assert.equal(await fixture.redis.ping(), true)
  assert.equal(fixture.redis.getStatus().connected, true)
})

test('lease admission fails closed during Redis outage and can recover afterward', async () => {
  const fixture = adapter()
  fixture.outage(true)
  await assert.rejects(fixture.redis.claimSseLease('lease-key', 'id', 5, 60), /Unavailable/)
  assert.equal(fixture.redis.getStatus().type, 'unavailable')
  fixture.outage(false)
  assert.equal(await fixture.redis.claimSseLease('lease-key', 'id', 5, 60), true)
})
