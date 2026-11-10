const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

test('membership query maps allowed row positions to the exact requested UUID pairs', async () => {
  let readMembership
  const queries = []
  const deps = {
    '@/lib/db/client': { getDb: () => async (sql, ...parameters) => {
      queries.push(parameters)
      return [{ request_index: 2n }]
    } },
    '@/lib/sse-authorization': { createBatchedMembershipVerifier: read => { readMembership = read; return () => {} } },
  }
  const js = ts.transpileModule(fs.readFileSync('app/api/realtime/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', js)(name => deps[name] ?? {}, {})
  const pairs = [
    { workspaceId: 'AAAAAAAA-0000-4000-8000-000000000001', actorId: 'BBBBBBBB-0000-4000-8000-000000000001' },
    { workspaceId: 'AAAAAAAA-0000-4000-8000-000000000002', actorId: 'BBBBBBBB-0000-4000-8000-000000000002' },
  ]
  assert.deepEqual(await readMembership(pairs), [pairs[1]])
  assert.deepEqual(queries, [[
    ['AAAAAAAA-0000-4000-8000-000000000001', 'AAAAAAAA-0000-4000-8000-000000000002'],
    ['BBBBBBBB-0000-4000-8000-000000000001', 'BBBBBBBB-0000-4000-8000-000000000002'],
  ]])
})

test('uppercase workspace UUIDs use the canonical workspace for authorization and every realtime operation', async () => {
  const requestedId = 'AAAAAAAA-0000-4000-8000-000000000001'
  const canonicalId = 'aaaaaaaa-0000-4000-8000-000000000001'
  const calls = { membership: [], presence: [], bounds: [], events: [], activeUsers: [] }
  const timers = []
  let released = 0
  const replay = {}
  const replayJs = ts.transpileModule(fs.readFileSync('lib/realtime-sse.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', replayJs)(() => ({}), replay)
  const deps = {
    'next/server': {},
    '@/lib/auth-simple': { getSession: async () => ({ id: 'actor', email: 'actor@example.test' }) },
    '@/lib/db/client': { getDb: () => async (_sql, workspaceIds) => {
      calls.membership.push(...workspaceIds)
      return [{ request_index: 1 }]
    } },
    '@/lib/realtime': { realtimeService: {
      setUserPresence: async workspaceId => { calls.presence.push(workspaceId) },
      getStreamBounds: async workspaceId => { calls.bounds.push(workspaceId); return null },
      readNewEvents: async workspaceId => { calls.events.push(workspaceId); return [] },
      getActiveUsers: async workspaceId => { calls.activeUsers.push(workspaceId); return [] },
      getMetrics: () => ({}),
    } },
    '@/lib/security': { schemas: { workspaceId: { safeParse: data => ({ success: true, data }) } } },
    '@/lib/realtime-sse': { ...replay, createSingleFlightPoll: fn => fn },
    '@/lib/env': { getRateLimits: () => ({ sse: {} }) },
    '@/lib/sse-connection': { acquireSseConnectionLease: async () => async () => { released++ }, RateLimitExceeded: class extends Error {}, SseConnectionLimitExceeded: class extends Error {} },
    '@/lib/sse-authorization': { createBatchedMembershipVerifier: read => async (workspaceId, actorId) => (await read([{ workspaceId, actorId }])).some(pair => pair.workspaceId === workspaceId && pair.actorId === actorId) },
  }
  const js = ts.transpileModule(fs.readFileSync('app/api/realtime/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  const addTimer = (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer }
  const args = { require: name => { assert.ok(name in deps, name); return deps[name] }, exports,
    setInterval: addTimer, clearInterval: timer => { timer.cleared = true },
    setTimeout: addTimer, clearTimeout: timer => { timer.cleared = true },
  }
  new Function(...Object.keys(args), js)(...Object.values(args))
  const response = await exports.GET({ url: `http://localhost/api/realtime?workspaceId=${requestedId}`, headers: new Headers(), signal: new AbortController().signal })
  assert.equal(response.status, 200)
  try {
    await new Promise(setImmediate)
    await timers.find(timer => timer.ms === 500).fn()
    for (const [operation, workspaceIds] of Object.entries(calls)) {
      assert.ok(workspaceIds.length > 0, `${operation} must run`)
      assert.ok(workspaceIds.every(workspaceId => workspaceId === canonicalId), `${operation} must use the canonical UUID`)
    }
  } finally {
    await response.body.cancel()
  }
  assert.equal(released, 1)
  assert.ok(timers.every(timer => timer.cleared), 'stream cancellation must clear timers')
  assert.ok(calls.presence.every(workspaceId => workspaceId === canonicalId), 'disconnect presence must use the canonical UUID')
})

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
    '@/lib/db/client': { getDb: () => async () => { membershipReads++; return member ? [{ request_index: 1 }] : [] } },
    '@/lib/realtime': { realtimeService: {
      setUserPresence: async () => {}, getStreamBounds: async () => bounds,
      readNewEvents: async () => { redisReads++; return events },
    } },
    '@/lib/security': { schemas: { workspaceId: { safeParse: () => ({ success: true, data: 'workspace' }) } } },
    '@/lib/realtime-sse': { ...replay, createSingleFlightPoll: fn => fn },
    '@/lib/env': { getRateLimits: () => ({ sse: {} }) },
    '@/lib/sse-connection': { acquireSseConnectionLease: async () => async () => {}, RateLimitExceeded: class extends Error {}, SseConnectionLimitExceeded: class extends Error {} },
    '@/lib/sse-authorization': { createBatchedMembershipVerifier: read => async (workspaceId, actorId) => (await read([{ workspaceId, actorId }])).some(pair => pair.workspaceId === workspaceId && pair.actorId === actorId) },
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
