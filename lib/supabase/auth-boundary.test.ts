import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeAuthRedirect, validateCredentials, resolveVerifiedSession, validateUsername, isSameOrigin } from './auth-boundary.ts'

test('auth redirects retain only local application destinations', () => {
  assert.equal(safeAuthRedirect('/dashboard?workspace=one'), '/dashboard?workspace=one')
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/login\n', 'javascript:alert(1)']) {
    assert.equal(safeAuthRedirect(value), '/dashboard')
  }
})

test('signup validates normalized identity and a bounded password', () => {
  assert.equal(validateCredentials('person@example.com', 'long-password', 'Asha'), null)
  assert.ok(validateCredentials('person', 'long-password', 'Asha'))
  assert.ok(validateCredentials('person@example.com', 'short', 'Asha'))
  assert.ok(validateCredentials('person@example.com', 'x'.repeat(129), 'Asha'))
  assert.ok(validateCredentials('person@example.com', 'long-password', ' '))
})

test('profile names reject invalid JSON shapes and bound storage input', () => {
  for (const value of [null, {}, [], 42, '', ' ', 'a', 'x'.repeat(51), '<script>']) assert.ok(validateUsername(value))
  assert.equal(validateUsername('  Asha Sharma  '), null)
})

test('cookie-authenticated profile mutations require matching origin', () => {
  assert.equal(isSameOrigin('https://saathi.test', 'https://saathi.test/api/users'), true)
  for (const origin of [null, 'null', 'https://evil.test', 'https://saathi.test.evil.test', 'http://saathi.test']) assert.equal(isSameOrigin(origin, 'https://saathi.test/api/users'), false)
})

test('session identity requires confirmed auth user and a matching authoritative profile', async () => {
  let reads = 0
  const lookup = async (id: string) => { reads++; return { id, email: 'person@example.com', username: 'Asha' } }
  assert.equal(await resolveVerifiedSession(null, lookup), null)
  assert.equal(await resolveVerifiedSession({ id: 'one', email: 'person@example.com' }, lookup), null)
  assert.equal(reads, 0)
  assert.deepEqual(await resolveVerifiedSession({ id: 'one', email: 'person@example.com', email_confirmed_at: '2026-09-01' }, lookup), { id: 'one', email: 'person@example.com', username: 'Asha' })
  assert.equal(await resolveVerifiedSession({ id: 'one', email: 'person@example.com', email_confirmed_at: '2026-09-01' }, async () => null), null)
  assert.equal(await resolveVerifiedSession({ id: 'one', email: 'person@example.com', email_confirmed_at: '2026-09-01' }, async () => ({ id: 'two', email: 'person@example.com', username: 'Other' })), null)
})
