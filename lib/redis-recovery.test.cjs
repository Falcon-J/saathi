const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function adapter({ entries = [], mock = false, arrayResponse = false } = {}) {
  let offline = false
  const values = new Map()
  const sets = new Map()
  const errors = []
  const commands = []
  class Redis {
    async set(key, value) { if (offline) throw new Error('Unavailable'); values.set(key, value); return 'OK' }
    async get(key) { if (offline) throw new Error('Unavailable'); commands.push(['get', key]); return values.get(key) ?? null }
    async mget(...keys) { if (offline) throw new Error('Unavailable'); commands.push(['mget', ...keys]); return keys.map(key => values.get(key) ?? null) }
    async sadd(key, ...members) { if (offline) throw new Error('Unavailable'); const set = sets.get(key) ?? new Set(); sets.set(key, set); members.forEach(member => set.add(member)); return members.length }
    async smembers(key) { if (offline) throw new Error('Unavailable'); commands.push(['smembers', key]); return [...sets.get(key) ?? []] }
    async srem(key, ...members) { if (offline) throw new Error('Unavailable'); commands.push(['srem', key, ...members]); return members.reduce((count, member) => count + Number(sets.get(key)?.delete(member) ?? false), 0) }
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

test('presence reads 25 members through one native batch instead of sequential GET calls', async () => {
  const fixture = adapter(), { realtime } = realtimeAdapter(fixture)
  const users = Array.from({ length: 25 }, (_, index) => `member-${index}`)
  await fixture.redis.sadd('presence:workspace:active', ...users)
  for (const user of users) await fixture.redis.set(`presence:workspace:${user}`, String(Date.now()))
  assert.deepEqual(await realtime.getActiveUsers('workspace'), users)
  assert.deepEqual(fixture.commands.map(command => command[0]), ['smembers', 'mget'])
  assert.deepEqual(fixture.commands[1].slice(1), users.map(user => `presence:workspace:${user}`))
})

test('presence batching preserves expiry boundary, value parsing and stale-member cleanup', async () => {
  for (const mock of [false, true]) {
    const fixture = adapter({ mock }), { realtime } = realtimeAdapter(fixture)
    const workspace = `expiry-${mock}`, prefix = `presence:${workspace}`
    const clock = Date.now
    Date.now = () => 2_000_000
    try {
      const timestamps = { current: '2000000', recent: 1_700_001, boundary: '1700000', expired: '1699999', malformed: 'no timestamp', object: { invalid: true }, zero: '0' }
      await fixture.redis.sadd(`${prefix}:active`, ...Object.keys(timestamps), 'missing')
      for (const [user, value] of Object.entries(timestamps)) await fixture.redis.set(`${prefix}:${user}`, value)
      assert.deepEqual(await realtime.getActiveUsers(workspace), ['current', 'recent'])
      assert.deepEqual(await fixture.redis.smembers(`${prefix}:active`), ['current', 'recent'])
    } finally { Date.now = clock }
  }
})

test('empty presence needs no batch and configured batch outages never fall back to mock', async () => {
  const fixture = adapter(), { realtime } = realtimeAdapter(fixture)
  assert.deepEqual(await realtime.getActiveUsers('empty'), [])
  assert.deepEqual(await fixture.redis.mget(), [])
  assert.deepEqual(fixture.commands.map(command => command[0]), ['smembers'])
  await fixture.redis.set('present', '123')
  fixture.outage(true)
  await assert.rejects(fixture.redis.mget('present'), /Redis unavailable/)
  fixture.outage(false)
  assert.deepEqual(await fixture.redis.mget('present', 'missing'), [123, null])
  assert.equal(fixture.redis.getStatus().type, 'redis')
})
