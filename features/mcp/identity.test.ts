import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveMcpActor } from './identity.ts'
import { AuthSessionMissingError } from '@supabase/supabase-js'

const userId = '8b7ed239-c272-45d8-b945-228c2484aca7'
const user = { id: userId, email: 'actor@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }
test('MCP identity resolves the current confirmed provider user and matching profile', async () => {
  const actor = await resolveMcpActor({ userId, accessToken: 'not-logged' }, { getUser: async token => { assert.equal(token, 'not-logged'); return { data: { user }, error: null } }, getProfile: async id => ({ id }) })
  assert.deepEqual(actor, { id: userId, email: user.email, emailConfirmed: true, profileId: userId })
})
test('credential rejection is unauthenticated without querying the profile', async () => {
  for (const status of [401, 403]) assert.equal(await resolveMcpActor({ userId, accessToken: 'not-logged' }, { getUser: async () => ({ data: { user: null }, error: { status } }), getProfile: async () => { throw new Error('Unexpected profile query') } }), null)
})
test('the real SDK normalizes a revoked provider session to its status-400 missing-session error', async () => {
  assert.equal(await resolveMcpActor({ userId, accessToken: 'not-logged' }, { getUser: async () => ({ data: { user: null }, error: new AuthSessionMissingError() }), getProfile: async () => { throw new Error('Unexpected profile query') } }), null)
})
test('provider transport and service failures stay unavailable rather than rejecting credentials', async () => {
  for (const status of [0, 429, 500, 503, undefined]) await assert.rejects(resolveMcpActor({ userId, accessToken: 'not-logged' }, { getUser: async () => ({ data: { user: null }, error: { status } }), getProfile: async () => null }), { message: 'Identity service is unavailable' })
})
test('missing or mismatched identity and missing profile never produce an actor', async () => {
  for (const candidate of [null, { ...user, id: 'different' }, { ...user, email: '' }]) assert.equal(await resolveMcpActor({ userId, accessToken: 'not-logged' }, { getUser: async () => ({ data: { user: candidate }, error: null }), getProfile: async id => ({ id }) }), null)
  assert.equal(await resolveMcpActor({ userId, accessToken: 'not-logged' }, { getUser: async () => ({ data: { user }, error: null }), getProfile: async () => null }), null)
})
