import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { flushOutbox } from "./events.ts"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timed out waiting for concurrent outbox claims")), 10000)
    })])
  } finally { if (timer) clearTimeout(timer) }
}

test("outbox claims stay disjoint, skip locks and leases, retry expiry and bind acknowledgments to tokens", { skip: !process.env.DATABASE_TEST_URL }, async t => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  // Isolated test process: one connection may hold a deliberate row lock.
  process.env.DATABASE_POOL_MAX = "2"
  const db = getDb()
  const { realtimeService } = await import("../realtime.ts")
  const publish = realtimeService.publishEvent
  // Outbox intentionally has no workspace FK, so only disposable outbox UUIDs
  // are needed; no Auth identities, profiles, workspace or Redis data is created.
  const workspace = randomUUID(), foreign = randomUUID(), actor = randomUUID()
  const insert = async (id: string, workspaceId = workspace, claimedAt: string | null = null, token: string | null = null) => {
    await db`INSERT INTO outbox_events (id,workspace_id,event_type,payload,created_at,claimed_at,claim_token)
      VALUES (${id},${workspaceId},'task-created',${db.json({ type: "task-created", workspaceId, userId: actor,
        timestamp: Date.now(), data: { eventId: id } })},'2000-01-01',${claimedAt}::timestamptz,${token}::uuid)`
  }
  try {
    await t.test("overlapping flushes claim separate batches and exclude locked, leased and foreign rows", async () => {
      const eligible = Array.from({ length: 50 }, () => randomUUID())
      const expired = new Set(eligible.slice(0, 2)), staleToken = randomUUID()
      const leased = randomUUID(), leaseToken = randomUUID(), locked = randomUUID(), foreignId = randomUUID()
      for (const id of eligible) await insert(id, workspace, expired.has(id) ? "2000-01-01" : null, expired.has(id) ? staleToken : null)
      await insert(leased, workspace, new Date().toISOString(), leaseToken)
      await insert(locked)
      await insert(foreignId, foreign)
      const lockReady = deferred(), unlock = deferred(), publishing = deferred(), releasePublication = deferred()
      const delivered: string[] = []
      let firstPublications = 0
      const lock = db.begin(async tx => {
        await tx`SELECT id FROM outbox_events WHERE id=${locked} FOR UPDATE`
        lockReady.resolve()
        await unlock.promise
      })
      let workers: Array<ReturnType<typeof flushOutbox>> = []
      try {
        await bounded(Promise.race([lockReady.promise, lock]))
        realtimeService.publishEvent = async event => {
          delivered.push(event.data.eventId as string)
          if (++firstPublications === 2) publishing.resolve()
          await releasePublication.promise
          return "1-0"
        }
        workers = [flushOutbox(workspace), flushOutbox(workspace)]
        // Each flush pauses on its first publication, after committing its claim.
        await bounded(publishing.promise)
        // Both claims have committed; release the deliberate lock to free the
        // other connection for inspection while publication remains paused.
        unlock.resolve()
        await lock
        const claims = await db`SELECT id,claim_token,published_at FROM outbox_events WHERE id=ANY(${eligible}::uuid[])`
        assert.equal(claims.length, 50)
        const batches = new Map<string, number>()
        for (const row of claims) {
          assert.ok(row.claim_token)
          assert.notEqual(row.claim_token, staleToken)
          assert.equal(row.published_at, null)
          batches.set(row.claim_token, (batches.get(row.claim_token) ?? 0) + 1)
        }
        assert.deepEqual([...batches.values()].sort(), [25, 25])
        assert.equal(new Set(delivered).size, 2)
        releasePublication.resolve()
        const results = await Promise.all(workers)
        assert.deepEqual(results, Array.from({ length: 2 }, () => ({ attempted: 25, published: 25, failed: 0, unavailable: false })))
        assert.deepEqual([...delivered].sort(), [...eligible].sort())
        assert.equal(new Set(delivered).size, 50)
        const skipped = await db`SELECT id,claim_token,published_at,attempt_count FROM outbox_events WHERE id IN (${leased},${locked},${foreignId})`
        for (const row of skipped) {
          assert.equal(row.published_at, null)
          assert.equal(row.attempt_count, 0)
          assert.equal(row.claim_token, row.id === leased ? leaseToken : null)
        }
        const completed = await db`SELECT id,published_at,claim_token,claimed_at,attempt_count FROM outbox_events WHERE id=ANY(${eligible}::uuid[])`
        assert.ok(completed.every(row => row.published_at && row.claim_token === null && row.claimed_at === null && row.attempt_count === 1))
        realtimeService.publishEvent = async () => "1-0"
        assert.deepEqual(await flushOutbox(workspace), { attempted: 1, published: 1, failed: 0, unavailable: false })
      } finally {
        unlock.resolve()
        releasePublication.resolve()
        await Promise.allSettled([lock, ...workers])
        realtimeService.publishEvent = publish
        await db`DELETE FROM outbox_events WHERE workspace_id IN (${workspace},${foreign})`
      }
    })

    await t.test("a stale publisher cannot acknowledge or clear another worker's replacement lease", async () => {
      const id = randomUUID(), replacement = randomUUID()
      await insert(id)
      realtimeService.publishEvent = async () => {
        await db`UPDATE outbox_events SET claim_token=${replacement},claimed_at=now() WHERE id=${id}`
        return "1-0"
      }
      await flushOutbox(workspace)
      const [stillClaimed] = await db`SELECT published_at,claim_token,claimed_at,attempt_count FROM outbox_events WHERE id=${id}`
      assert.equal(stillClaimed.published_at, null)
      assert.equal(stillClaimed.claim_token, replacement)
      assert.ok(stillClaimed.claimed_at)
      assert.equal(stillClaimed.attempt_count, 0)
      await db`UPDATE outbox_events SET claimed_at=now()-interval '6 minutes' WHERE id=${id}`
      realtimeService.publishEvent = async () => "1-0"
      assert.deepEqual(await flushOutbox(workspace), { attempted: 1, published: 1, failed: 0, unavailable: false })
      const [retried] = await db`SELECT published_at,claim_token,claimed_at,attempt_count FROM outbox_events WHERE id=${id}`
      assert.ok(retried.published_at)
      assert.equal(retried.claim_token, null)
      assert.equal(retried.claimed_at, null)
      assert.equal(retried.attempt_count, 1)
    })
  } finally {
    realtimeService.publishEvent = publish
    await db`DELETE FROM outbox_events WHERE workspace_id IN (${workspace},${foreign})`
    assert.equal((await db`SELECT id FROM outbox_events WHERE workspace_id IN (${workspace},${foreign})`).length, 0)
    await db.end()
  }
})
