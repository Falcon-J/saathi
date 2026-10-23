const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function adapter({ entries = [], mock = false, arrayResponse = false } = {}) {
  let offline = false
  const values = new Map()
  const errors = []
  const commands = []
  class Redis {
    async set(key, value) { if (offline) throw new Error('Unavailable'); values.set(key, value); return 'OK' }
    async get(key) { if (offline) throw new Error('Unavailable'); return values.get(key) ?? null }
    async ping() { if (offline) throw new Error('private-redis-error-secret'); return 'PONG' }
    async eval(script, keys) {
      if (offline) throw new Error('Unavailable')
      if (!script.includes('XREVRANGE')) return 1
      commands.push(['eval', keys, script])
      assert.match(script, /XRANGE.*COUNT.*1/)
      assert.match(script, /XREVRANGE.*COUNT.*1/)
      return entries.length ? [entries[0][0], entries.at(-1)[0]] : []
    }
    async xrange(key, start, end, count) {
      if (offline) throw new Error('Unavailable')
      commands.push(['xrange', key, start, end, count])
      const rows = count ? entries.slice(0, count) : entries
      return arrayResponse ? rows : Object.fromEntries(rows)
    }
    async xrevrange(key, end, start, count) {
      if (offline) throw new Error('Unavailable')
      commands.push(['xrevrange', key, end, start, count])
      assert.equal(count, 1)
      const rows = entries.slice(-count).reverse()
      return arrayResponse ? rows : Object.fromEntries(rows)
    }
  }
  const deps = {
    '@upstash/redis': { Redis },
    './env.ts': { env: { NODE_ENV: mock ? 'development' : 'production' }, getRedisConfig: () => mock ? {} : ({ url: 'https://redis.test', token: 'fixture' }) },
    './redis-policy.ts': { shouldUseMockRedis: () => mock },
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('lib/redis.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', 'console', 'setTimeout', js)(name => deps[name], exports, { log() {}, warn() {}, error(...args) { errors.push(args) } }, callback => { callback(); return { unref() {} } })
  return { redis: exports.redis, errors, commands, outage(value) { offline = value } }
}

function realtimeAdapter(fixture) {
  function load(file, deps) {
    const exports = {}
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function('require', 'exports', js)(name => { assert.ok(name in deps, name); return deps[name] }, exports)
    return exports
  }
  const streams = load('lib/redis-streams.ts', { './redis.ts': fixture })
  const realtime = load('lib/realtime.ts', { './redis.ts': fixture, './redis-streams.ts': streams, zod: require('zod') })
  return { streams: streams.streamService, realtime: realtime.realtimeService }
}

for (const count of [0, 1, 1000]) test(`stream bounds and latest transfer constant data for ${count} retained entries`, async () => {
  const entries = Array.from({ length: count }, (_, index) => [`100-${index}`, { value: String(index) }])
  const fixture = adapter({ entries }), services = realtimeAdapter(fixture)
  assert.deepEqual(await services.realtime.getStreamBounds('workspace'), count ? { oldestId: '100-0', latestId: `100-${count - 1}` } : null)
  assert.deepEqual(await services.streams.getLatestEntry('stream:workspace'), count ? { id: `100-${count - 1}`, fields: { value: String(count - 1) } } : null)
  assert.equal(fixture.commands.length, 2)
  assert.equal(fixture.commands[0][0], 'eval')
  assert.deepEqual(fixture.commands[0][1], ['stream:workspace'])
  assert.deepEqual(fixture.commands[1], ['xrevrange', 'stream:workspace', '+', '-', 1])
})

test('bounded latest uses the existing flat-array field parser', async () => {
  const fixture = adapter({ entries: [['100-10', ['value', 3, 'object', { nested: true }]]], arrayResponse: true })
  assert.deepEqual(await realtimeAdapter(fixture).streams.getLatestEntry('key'), { id: '100-10', fields: { value: '3', object: '{"nested":true}' } })
})

test('development stream bounds and latest track trimming and numeric stream order', async () => {
  const fixture = adapter({ mock: true }), services = realtimeAdapter(fixture)
  const key = `stream:bounded-${Date.now()}`
  assert.equal(await services.realtime.getStreamBounds(key.slice(7)), null)
  for (const id of ['100-2', '100-9', '100-10']) await fixture.redis.xadd(key, id, { value: id })
  await fixture.redis.xtrim(key, 2)
  assert.deepEqual(await services.realtime.getStreamBounds(key.slice(7)), { oldestId: '100-9', latestId: '100-10' })
  assert.equal((await services.streams.getLatestEntry(key)).id, '100-10')
})

test('stream bounds and latest fail closed during outage and recover', async () => {
  const fixture = adapter({ entries: [['100-10', { value: 'latest' }]] }), services = realtimeAdapter(fixture)
  fixture.outage(true)
  await assert.rejects(services.realtime.getStreamBounds('workspace'), /Redis unavailable/)
  await assert.rejects(services.streams.getLatestEntry('stream:workspace'), /Redis unavailable/)
  fixture.outage(false)
  assert.deepEqual(await services.realtime.getStreamBounds('workspace'), { oldestId: '100-10', latestId: '100-10' })
})

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
  assert.deepEqual(fixture.errors, [['[Saathi] Redis ping failed']], 'ping errors must never expose provider details')
  fixture.outage(false)
  assert.equal(await fixture.redis.ping(), true)
  assert.equal(fixture.redis.getStatus().connected, true)
  assert.equal(fixture.errors.length, 1, 'successful recovery must not log another failure')
})

test('lease admission fails closed during Redis outage and can recover afterward', async () => {
  const fixture = adapter()
  fixture.outage(true)
  await assert.rejects(fixture.redis.claimSseLease('lease-key', 'id', 5, 60), /Unavailable/)
  assert.equal(fixture.redis.getStatus().type, 'unavailable')
  fixture.outage(false)
  assert.equal(await fixture.redis.claimSseLease('lease-key', 'id', 5, 60), true)
})
