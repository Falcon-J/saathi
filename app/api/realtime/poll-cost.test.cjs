const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

test('idle polling avoids per-tick SQL but rechecks membership before delivering an event batch', async () => {
  const timers = [], messages = []
  let membershipReads = 0, redisReads = 0, now = 1000, member = true, events = []
  let bounds = { oldestId: null, latestId: null }
  const replay = {}
  const replayJs = ts.transpileModule(fs.readFileSync('lib/realtime-sse.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', replayJs)(() => ({}), replay)
  const deps = {
    'next/server': {},
    '@/lib/auth-simple': { getSession: async () => ({ id: 'actor', email: 'actor@example.test' }) },
    '@/lib/db/client': { getDb: () => async () => { membershipReads++; return member ? [{}] : [] } },
    '@/lib/realtime': { realtimeService: {
      setUserPresence: async () => {}, getStreamBounds: async () => bounds,
      readNewEvents: async () => { redisReads++; return events },
    } },
    '@/lib/security': { schemas: { workspaceId: { safeParse: () => ({ success: true, data: 'workspace' }) } } },
    '@/lib/realtime-sse': { ...replay, createSingleFlightPoll: fn => fn },
    '@/lib/env': { getRateLimits: () => ({ sse: {} }) },
    '@/lib/sse-connection': { acquireSseConnectionLease: async () => async () => {}, RateLimitExceeded: class extends Error {}, SseConnectionLimitExceeded: class extends Error {} },
    '@/lib/sse-authorization': { createMembershipVerifier: read => read },
  }
  const js = ts.transpileModule(fs.readFileSync('app/api/realtime/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  class FakeStream { constructor(source) { this.ready = source.start({ enqueue: data => messages.push(new TextDecoder().decode(data)), close() {} }) } }
  const args = { require: name => { assert.ok(name in deps, name); return deps[name] }, exports, ReadableStream: FakeStream,
    Response: class { constructor(body) { this.body = body } },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    Date: { now: () => now }, console: { error() {} } }
  new Function(...Object.keys(args), js)(...Object.values(args))
  const response = await exports.GET({ url: 'http://localhost/api/realtime?workspaceId=workspace', headers: { get: () => null }, signal: { addEventListener() {} } })
  await response.body.ready
  const poll = timers[0]
  // At most two idle Redis reads per second. SQL is periodically rechecked.
  assert.ok(poll.ms >= 500)
  for (let i = 0; i < 8; i++) { now += poll.ms; await poll.fn() }
  assert.ok(membershipReads <= 2)
  assert.equal(redisReads, 8)
  bounds = { oldestId: '1-0', latestId: '1-0' }
  events = [{ _streamId: '1-0', type: 'task-created', workspaceId: 'workspace', data: { title: 'First event' } }]
  now += poll.ms
  await poll.fn()
  await new Promise(setImmediate)
  assert.ok(messages.some(message => message.includes('First event')), 'a new empty stream must deliver its first event')
  member = false
  events = [{ _streamId: '2-0', type: 'task-created', workspaceId: 'workspace', data: { title: 'Private' } }]
  now += poll.ms
  await poll.fn()
  await new Promise(setImmediate)
  assert.ok(membershipReads >= 2)
  assert.ok(!messages.some(message => message.includes('Private')))
})
