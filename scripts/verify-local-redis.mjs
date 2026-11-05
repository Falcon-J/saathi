import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { startLocalRedisRest } from './local-redis-rest.mjs'

// Credentials are scoped to this test process and never logged or saved.
const token = randomUUID()
const live = await startLocalRedisRest({ token })
process.env.UPSTASH_REDIS_REST_URL = live.url
process.env.UPSTASH_REDIS_REST_TOKEN = token
process.env.NODE_ENV = 'production'
const { redis } = await import('../lib/redis.ts')
const key = `test:core-redis:${randomUUID()}`
try {
  assert.equal(await redis.ping(), true)
  assert.equal(await redis.setIfAbsent(`${key}:claim`, 'first', { ex: 60 }), true)
  assert.equal(await redis.setIfAbsent(`${key}:claim`, 'second', { ex: 60 }), false)
  const counts = await Promise.all(Array.from({ length: 100 }, () => redis.incrementWithExpiry(`${key}:rate`, 60)))
  assert.deepEqual(counts.sort((a, b) => a - b), Array.from({ length: 100 }, (_, index) => index + 1))
  const initialTtl = await live.command(['TTL', `${key}:rate`])
  assert.ok(initialTtl > 0 && initialTtl <= 60, 'atomic rate counter must have an expiry')
  await live.command(['EXPIRE', `${key}:rate`, '10'])
  assert.equal(await redis.incrementWithExpiry(`${key}:rate`, 60), 101)
  assert.ok(await live.command(['TTL', `${key}:rate`]) <= 10, 'later increments must not extend the first-use expiry')
  const first = await redis.xadd(key, '*', { event: 'first' })
  const second = await redis.xadd(key, '*', { event: 'second' })
  assert.deepEqual((await redis.xread(key, first)).map(item => item.id), [second])
  live.outage(true)
  assert.equal(await redis.ping(), false)
  assert.equal(redis.getStatus().type, 'unavailable')
  await assert.rejects(redis.incrementWithExpiry(`${key}:rate`, 60), /./, 'rate admission must fail closed during an outage')
  live.outage(false)
  assert.equal(await redis.ping(), true)
  assert.equal(await redis.xlen(key), 2)
  const connections = 200, events = 3
  let cursor = second, delivered = 0
  const latencies = []
  for (let event = 0; event < events; event++) {
    const sent = performance.now()
    const id = await redis.xadd(key, '*', { benchmark: String(event) })
    await Promise.all(Array.from({ length: connections }, async () => {
      const received = await redis.xread(key, cursor)
      assert.ok(received.some(item => item.id === id))
      delivered++
      latencies.push(performance.now() - sent)
    }))
    cursor = id
  }
  latencies.sort((a, b) => a - b)
  console.log(JSON.stringify({ scope: 'real Redis adapter fanout; not authenticated HTTP SSE capacity', connections, events, delivered, expected: connections * events, p95Ms: Math.round(latencies[Math.ceil(latencies.length * 0.95) - 1]), commands: live.requests, outageRecovery: true }))
} finally {
  await redis.del(key)
  await redis.del(`${key}:claim`)
  await redis.del(`${key}:rate`)
  await live.close()
}
