import test from "node:test"
import assert from "node:assert/strict"
import { createCoalescedRefresh } from "./read-coordinator.ts"

test("a burst shares one read and schedules one trailing refresh", async () => {
  let reads = 0, release!: () => void
  const run = createCoalescedRefresh(async () => {
    reads++
    if (reads === 1) await new Promise<void>(resolve => { release = resolve })
  })
  const first = run()
  const calls = Array.from({ length: 20 }, () => run())
  assert.equal(reads, 1)
  release()
  await Promise.all([first, ...calls])
  assert.equal(reads, 2)
})

test("failed refresh does not permanently block subsequent refresh", async () => {
  let reads = 0
  const run = createCoalescedRefresh(async () => { if (++reads === 1) throw new Error("Unavailable") })
  await assert.rejects(run(), /Unavailable/)
  await run()
  assert.equal(reads, 2)
})
