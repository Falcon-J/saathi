import assert from 'node:assert/strict'
import test from 'node:test'

import { loadStoredSession } from './session-boundary.ts'

test('fails closed when the session store is unavailable', async () => {
  const session = await loadStoredSession('stale-session', async () => {
    throw new Error('Redis unavailable')
  })

  assert.equal(session, null)
})

test('returns a persisted session when the store is available', async () => {
  const session = await loadStoredSession('active-session', async () => (
    JSON.stringify({ email: 'aisha@example.com', username: 'Aisha' })
  ))

  assert.deepEqual(session, { email: 'aisha@example.com', username: 'Aisha' })
})

test('rejects malformed persisted session data', async () => {
  const session = await loadStoredSession('bad-session', async () => '{"email":false}')

  assert.equal(session, null)
})
