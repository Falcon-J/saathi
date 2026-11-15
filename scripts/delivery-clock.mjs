/** Same-process monotonic dispatch → receipt is an upper bound on commit → receipt.
 * A successful acknowledgment can arrive after the event; never use ack time. */
export function createDeliveryClock({ onSample, maxTasks, maxObservations }) {
  if (typeof onSample !== 'function' || !Number.isSafeInteger(maxTasks) || maxTasks < 1 || !Number.isSafeInteger(maxObservations) || maxObservations < 1) throw new Error('Invalid delivery clock bounds')
  const dispatches = new Map(), pending = new Map(), seen = new Map()
  let unmapped = 0
  const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 256
  const instant = value => Number.isFinite(value) && value >= 0
  const taskKey = (workspaceId, taskId) => JSON.stringify([workspaceId, taskId])
  const emit = (observation, dispatchedAt) => onSample({ durationMs: observation.receivedAt - dispatchedAt, sample: observation.sample })
  return {
    receive({ workspaceId, taskId, eventId, observerSlot, receivedAt, sample }) {
      if (![workspaceId, taskId, eventId].every(identity) || !Number.isSafeInteger(observerSlot) || observerSlot < 0 || !instant(receivedAt)) throw new Error('Invalid delivery observation')
      const eventKey = JSON.stringify([workspaceId, eventId, observerSlot])
      if (seen.has(eventKey)) {
        if (seen.get(eventKey) !== taskId) throw new Error('Conflicting delivery identity')
        return false
      }
      if (seen.size >= maxObservations) throw new Error('Delivery observation bound exceeded')
      const key = taskKey(workspaceId, taskId), dispatchedAt = dispatches.get(key)
      if (dispatchedAt !== undefined && receivedAt < dispatchedAt) throw new Error('Invalid delivery interval')
      seen.set(eventKey, taskId)
      const observation = { receivedAt, sample }
      if (dispatchedAt !== undefined) emit(observation, dispatchedAt)
      else { const queue = pending.get(key) ?? []; queue.push(observation); pending.set(key, queue); unmapped++ }
      return true
    },
    confirm({ workspaceId, taskId, dispatchedAt }) {
      if (![workspaceId, taskId].every(identity) || !instant(dispatchedAt)) throw new Error('Invalid dispatch receipt')
      const key = taskKey(workspaceId, taskId), previous = dispatches.get(key)
      if (previous !== undefined) { if (previous !== dispatchedAt) throw new Error('Conflicting dispatch receipt'); return }
      if (dispatches.size >= maxTasks) throw new Error('Dispatch receipt bound exceeded')
      const queue = pending.get(key) ?? []
      if (queue.some(observation => observation.receivedAt < dispatchedAt)) throw new Error('Invalid delivery interval')
      dispatches.set(key, dispatchedAt)
      pending.delete(key); unmapped -= queue.length
      for (const observation of queue) emit(observation, dispatchedAt)
    },
    status: () => ({ observations: seen.size, confirmedTasks: dispatches.size, unmapped }),
    assertComplete() { if (unmapped !== 0) throw new Error('Unmatched delivery observations remain') },
  }
}
