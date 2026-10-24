import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { startLocalRedisRest } from './local-redis-rest.mjs'

const token = randomUUID(), bridge = await startLocalRedisRest({ token })
process.env.UPSTASH_REDIS_REST_URL = bridge.url
process.env.UPSTASH_REDIS_REST_TOKEN = token
process.env.NODE_ENV = 'production'
const { acquireSseConnectionLease, SseConnectionLimitExceeded } = await import('../lib/sse-connection.ts')
const userId = `lease-check-${randomUUID()}@example.test`
const options = { userId, maxConnections: 5, leaseSeconds: 60, maxAttempts: 300, attemptWindowMs: 60000 }
const releases = [], times = [], started = performance.now()
try {
  const outcomes = await Promise.allSettled(Array.from({ length: 200 }, async () => {
    const release = await acquireSseConnectionLease(options)
    releases.push(release)
    times.push(performance.now() - started)
  }))
  assert.equal(releases.length, 5, 'exactly five concurrent requests may claim the five available slots')
  assert.ok(outcomes.filter(result => result.status === 'rejected').every(result => result.reason instanceof SseConnectionLimitExceeded))
  assert.ok(bridge.requests <= 1000, `Admission must use bounded round trips, observed ${bridge.requests} commands`)
  times.sort((a, b) => a - b)
  console.log(JSON.stringify({ attempted: 200, admitted: releases.length, rejected: outcomes.length - releases.length, commands: bridge.requests, admissionP95Ms: Math.round(times[Math.ceil(times.length * .95) - 1]) }))

  const { redis } = await import('../lib/redis.ts')
  const key = `test:sse:lease:${randomUUID()}`
  try {
    assert.equal(await redis.claimSseLease(key, 'long', 2, 60), true)
    assert.equal(await redis.claimSseLease(key, 'long', 2, 60), true, 'a retry must reuse its existing slot')
    assert.equal(await redis.claimSseLease(key, 'short', 2, 1), true)
    assert.equal(await redis.claimSseLease(key, 'overflow', 2, 60), false)
    assert.ok(await bridge.command(['PTTL', key]) > 50000, 'a short lease must not shorten the lifetime of a longer lease')
    await bridge.command(['ZADD', key, '0', 'short'])
    assert.equal(await redis.claimSseLease(key, 'replacement', 2, 60), true, 'expired leases must not consume slots')
    await redis.releaseSseLease(key, 'long')
    await redis.releaseSseLease(key, 'long')
    assert.equal(await redis.claimSseLease(key, 'reused', 2, 60), true)
    await assert.rejects(redis.claimSseLease(key, 'invalid', 0, 60), /configuration is invalid/)
    console.log('Real Redis checks passed: retry identity, expiry, capacity, release and mixed lease TTLs.')
  } finally { await redis.del(key) }
} finally {
  await Promise.all(releases.map(release => release()))
  await bridge.close()
}
