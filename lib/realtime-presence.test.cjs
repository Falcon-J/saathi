const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function realtime(redis) {
  const exports = {}
  const deps = { './redis.ts': { redis }, './redis-streams.ts': {}, './realtime-event.ts': {} }
  const js = ts.transpileModule(fs.readFileSync('lib/realtime.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', 'console', js)(name => { assert.ok(name in deps, name); return deps[name] }, exports, { error() {} })
  return exports.realtimeService
}

function adapter(mock) {
  const timers = [], calls = []
  const deps = {
    '@upstash/redis': { Redis: class { async eval(...args) { calls.push(args); return calls.length === 1 ? 1 : 0 } } },
    './env.ts': { env: { NODE_ENV: mock ? 'development' : 'production' }, getRedisConfig: () => mock ? {} : { url: 'https://redis.test', token: 'fixture' } },
    './redis-policy.ts': { shouldUseMockRedis: () => mock },
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('lib/redis.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const schedule = (callback, milliseconds) => {
    const timer = { callback, milliseconds, cleared: false, unrefed: false, unref() { this.unrefed = true } }
    timers.push(timer)
    return timer
  }
  new Function('require', 'exports', 'console', 'globalThis', 'setTimeout', 'clearTimeout', js)(
    name => { assert.ok(name in deps, name); return deps[name] }, exports, { log() {}, warn() {}, error() {} }, {},
    schedule, timer => { timer.cleared = true },
  )
  return { redis: exports.redis, timers, calls }
}

test('presence atomically adds its member and refreshes active-set expiry on every heartbeat', async () => {
  const calls = []
  let release
  const service = realtime({
    set: async (...args) => { calls.push(['set', ...args]) },
    saddWithExpiry: async (...args) => { calls.push(['saddWithExpiry', ...args]); await new Promise(resolve => { release = resolve }) },
  })
  const first = service.setUserPresence('workspace', 'actor@example.test')
  await new Promise(setImmediate)
  assert.deepEqual(calls.map(call => call[0]), ['set', 'saddWithExpiry'])
  release()
  await first
  assert.deepEqual(calls[0].slice(1, 2), ['presence:workspace:actor@example.test'])
  assert.deepEqual(calls[0][3], { ex: 300 })
  assert.deepEqual(calls.slice(1), [
    ['saddWithExpiry', 'presence:workspace:active', 300, 'actor@example.test'],
  ])
  const refresh = service.setUserPresence('workspace', 'actor@example.test')
  await new Promise(setImmediate)
  assert.equal(calls.filter(call => call[0] === 'saddWithExpiry').length, 2)
  release()
  await refresh
  assert.deepEqual(calls.at(-1), ['saddWithExpiry', 'presence:workspace:active', 300, 'actor@example.test'])
  assert.equal(calls.length, 4, 'each presence refresh must use only two adapter commands')
})

test('failed presence timestamp does not write or expire the active set', async () => {
  let updates = 0
  const service = realtime({ set: async () => { throw new Error('Unavailable') }, saddWithExpiry: async () => { updates++ } })
  await service.setUserPresence('workspace', 'actor@example.test')
  assert.equal(updates, 0)
})

test('real active-set refresh uses one atomic Redis script even when SADD adds no new member', async () => {
  const fixture = adapter(false)
  assert.equal(await fixture.redis.saddWithExpiry('presence:workspace:active', 300, 'actor'), 1)
  assert.equal(await fixture.redis.saddWithExpiry('presence:workspace:active', 300, 'actor'), 0)
  assert.equal(fixture.calls.length, 2)
  for (const [script, keys, args] of fixture.calls) {
    assert.deepEqual(keys, ['presence:workspace:active'])
    assert.deepEqual(args, [300, 'actor'])
    assert.match(script, /local\s+added\s*=\s*redis.call\('SADD',\s*KEYS\[1\],\s*unpack\(ARGV,\s*2\)\)/)
    assert.match(script, /redis.call\('EXPIRE',\s*KEYS\[1\],\s*ARGV\[1\]\)\s+return added/)
  }
})

test('mock active-set refresh updates members and TTL together without stale timers deleting renewed presence', async () => {
  const { redis, timers } = adapter(true)
  await redis.sadd('presence:two:active', 'other')
  assert.equal(await redis.saddWithExpiry('presence:one:active', 300, 'actor', 'actor'), 1)
  assert.equal(await redis.saddWithExpiry('presence:one:active', 300, 'actor'), 0)
  assert.equal(timers[0].cleared, true)
  assert.ok(timers.every(timer => timer.unrefed && timer.milliseconds === 300000))
  timers[0].callback()
  assert.deepEqual(await redis.smembers('presence:one:active'), ['actor'])
  for (const timer of timers) if (!timer.cleared) timer.callback()
  assert.deepEqual(await redis.smembers('presence:one:active'), [])
  assert.deepEqual(await redis.smembers('presence:two:active'), ['other'])
})

test('mock presence timestamps survive an earlier heartbeat expiry and expire after their latest refresh', async () => {
  const { redis, timers } = adapter(true)
  await redis.set('presence:workspace:actor', '1000', { ex: 300 })
  await redis.set('presence:workspace:actor', '2000', { ex: 300 })
  timers[0].callback()
  assert.equal(await redis.get('presence:workspace:actor'), 2000)
  timers[1].callback()
  assert.equal(await redis.get('presence:workspace:actor'), null)
})

test('mock SET without expiry and delete followed by recreation discard the old expiry', async () => {
  const { redis, timers } = adapter(true)
  await redis.set('persistent', 'old', { ex: 300 })
  await redis.set('persistent', 'replacement')
  timers[0].callback()
  assert.equal(await redis.get('persistent'), 'replacement')

  await redis.set('recreated', 'old', { ex: 300 })
  await redis.del('recreated')
  await redis.set('recreated', 'replacement')
  timers[1].callback()
  assert.equal(await redis.get('recreated'), 'replacement')
})
