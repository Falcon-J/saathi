const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')

const source = readFileSync('scripts/verify-nfr-local.mjs', 'utf8')
const functionSource = name => {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0)
  const begin = source.slice(start - 6, start) === 'async ' ? start - 6 : start
  return source.slice(begin, source.indexOf('\n}', start) + 2)
}
const runWrites = new Function(`return (${functionSource('runWrites')})`)()
const tick = () => new Promise(resolve => setImmediate(resolve))

test('measured read throughput excludes warmup requests', () => {
  const assignment = source.split('\n').find(line => line.includes('result.readWorkload ='))
  const result = { elapsedMs: 60000 }
  new Function('result', 'samples', 'readAttempts', assignment)(result, { read: Array(740) }, 940)
  assert.equal(result.readWorkload.attempts, 740)
  assert.equal(result.readWorkload.achievedRequestsPerSecond, 740 / 60)
})

test('a slow identity does not delay another identity scheduled to write', async () => {
  let clock = 0, releaseFirst
  const first = new Promise(resolve => { releaseFirst = resolve })
  const waiting = [], calls = []
  const sleep = delay => delay <= 0 ? Promise.resolve() : new Promise(resolve => waiting.push({ at: clock + delay, resolve }))
  const advance = async value => {
    clock = value
    for (const item of waiting.filter(item => item.at <= clock)) item.resolve()
    await tick()
  }
  const pending = runWrites(['slow', 'independent'], 4, 0, 3600, async (user, index, intendedAt) => {
    calls.push({ user, index, intendedAt, actualAt: clock })
    if (index === 0) await first
  }, () => clock, sleep)
  await tick()
  assert.equal(calls[0].index, 0)
  await advance(900)
  assert.ok(calls.some(call => call.index === 1 && call.actualAt === 900), 'independent user must start at its original 900ms slot')
  await advance(1800)
  assert.equal(calls.some(call => call.index === 2), false, 'one identity must not overlap its writes')
  await advance(2000); releaseFirst(); await tick()
  assert.equal(calls.find(call => call.index === 2).actualAt, 2000)
  assert.equal(calls.find(call => call.index === 2).intendedAt, 1800, 'late work retains its original slot for lag measurement')
  await advance(2700); await pending
  assert.deepEqual(calls.map(call => call.index).sort(), [0, 1, 2, 3])
})

test('timing evidence uses a fixed allowlist and drops samples beyond its bound', () => {
  const rows = [], flushed = []
  const timing = new Function('timingLimit', 'timingBuffer', 'flushTimings', `let timingCount=0,timingDropped=0; ${functionSource('timing')}; return {sample:timing,counts:()=>({timingCount,timingDropped})}`)(2, rows, () => flushed.push(true))
  timing.sample({ kind: 'request', durationMs: 12, at: '2026-10-23T00:00:00Z', cookie: 'secret', userId: 'private-user', title: 'private title', payload: { token: 'secret' } })
  timing.sample({ kind: 'event', durationMs: 24 })
  timing.sample({ kind: 'event', durationMs: 48 })
  assert.deepEqual(JSON.parse(rows[0]), { kind: 'request', at: '2026-10-23T00:00:00Z', durationMs: 12 })
  assert.equal(rows.length, 2)
  assert.deepEqual(timing.counts(), { timingCount: 2, timingDropped: 1 })
  assert.equal(flushed.length, 0)
})

test('an unfinished failed workload retains elapsed time and intended versus achieved rates', () => {
  const stats = new Function('performance', 'envelope', 'mutations', 'samples', 'summary', `let workloadStarted=1000,workloadEnded=null,writesAttempted=4; ${functionSource('workloadStats')}; return workloadStats()`)(
    { now: () => 5000 }, { writes: 1000, seconds: 900 }, [{}, {}, {}], { scheduleLag: [10, 20] }, values => ({ count: values.length }),
  )
  assert.equal(stats.elapsedMs, 4000)
  assert.equal(stats.intendedWriteRatePerSecond, 1000 / 900)
  assert.equal(stats.achievedWriteRatePerSecond, .75)
  assert.equal(stats.attemptedWriteRatePerSecond, 1)
  assert.deepEqual(stats.scheduleLag, { count: 2 })
})
