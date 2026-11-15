import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeliveryClock } from './delivery-clock.mjs'

const observation = (overrides = {}) => ({ workspaceId: 'workspace', taskId: 'task', eventId: 'event', observerSlot: 0, receivedAt: 150, sample: { eventSlot: 0 }, ...overrides })
test('an event preceding its HTTP acknowledgment retains its monotonic receipt time', () => {
  const samples = [], clock = createDeliveryClock({ onSample: sample => samples.push(sample), maxTasks: 2, maxObservations: 4 })
  assert.equal(clock.receive(observation()), true)
  assert.equal(samples.length, 0)
  assert.equal(clock.status().unmapped, 1)
  clock.confirm({ workspaceId: 'workspace', taskId: 'task', dispatchedAt: 100 })
  assert.deepEqual(samples, [{ durationMs: 50, sample: { eventSlot: 0 } }])
  clock.assertComplete()
})
test('duplicates before or after acknowledgment never add a latency sample', () => {
  const samples = [], clock = createDeliveryClock({ onSample: value => samples.push(value), maxTasks: 1, maxObservations: 2 })
  clock.receive(observation())
  assert.equal(clock.receive(observation({ receivedAt: 200 })), false)
  clock.confirm({ workspaceId: 'workspace', taskId: 'task', dispatchedAt: 100 })
  assert.equal(clock.receive(observation({ receivedAt: 300 })), false)
  clock.receive(observation({ observerSlot: 1, receivedAt: 180 }))
  assert.deepEqual(samples.map(value => value.durationMs), [50, 80])
  assert.equal(clock.status().observations, 2)
})
test('wall-clock changes do not affect durations; unknown or mismatched acknowledgments remain failures', () => {
  const original = Date.now, samples = []
  const clock = createDeliveryClock({ onSample: value => samples.push(value), maxTasks: 3, maxObservations: 2 })
  try {
    Date.now = () => 1000
    clock.receive(observation())
    Date.now = () => 100
    clock.confirm({ workspaceId: 'other', taskId: 'task', dispatchedAt: 100 })
    clock.confirm({ workspaceId: 'workspace', taskId: 'other', dispatchedAt: 100 })
    assert.throws(() => clock.assertComplete(), /Unmatched/)
    assert.equal(samples.length, 0)
    Date.now = () => 900000
    clock.confirm({ workspaceId: 'workspace', taskId: 'task', dispatchedAt: 100 })
    assert.equal(samples[0].durationMs, 50)
    clock.assertComplete()
  } finally { Date.now = original }
})
test('bookkeeping is bounded and impossible timing or conflicting receipts fail closed', () => {
  const clock = createDeliveryClock({ onSample() {}, maxTasks: 1, maxObservations: 1 })
  clock.confirm({ workspaceId: 'workspace', taskId: 'task', dispatchedAt: 100 })
  assert.throws(() => clock.confirm({ workspaceId: 'workspace', taskId: 'task', dispatchedAt: 99 }), /Conflicting/)
  assert.throws(() => clock.receive(observation({ receivedAt: 99 })), /Invalid/)
  clock.receive(observation())
  assert.throws(() => clock.receive(observation({ observerSlot: 1 })), /bound/)
  assert.throws(() => clock.confirm({ workspaceId: 'workspace', taskId: 'another', dispatchedAt: 100 }), /bound/)
})
