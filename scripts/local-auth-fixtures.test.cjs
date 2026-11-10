const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('./local-auth-fixtures.mjs')
const email = 'owned-fixture@example.test'
const noPause = async () => {}

test('successful local fixture creation performs no ownership lookup', async () => {
  const { createLocalAuthFixture } = await load()
  const result = await createLocalAuthFixture({ email,
    createUser: async () => ({ data: { user: { id: 'owned-id' } }, error: null }),
    findUserByEmail: async () => { assert.fail('successful create must not query SQL') }, pause: noPause,
  })
  assert.deepEqual(result, { user: { id: 'owned-id' }, retries: 0, recovered: false })
})

test('ambiguous transport failure recovers only the exact owned email before another create', async () => {
  const { createLocalAuthFixture } = await load()
  let creates = 0
  const result = await createLocalAuthFixture({ email,
    createUser: async () => { creates++; throw new TypeError('sensitive transport details') },
    findUserByEmail: async requested => { assert.equal(requested, email); return { id: 'committed-id' } },
    pause: async () => assert.fail('recovered fixture needs no retry delay'),
  })
  assert.equal(creates, 1)
  assert.deepEqual(result, { user: { id: 'committed-id' }, retries: 0, recovered: true })
})

test('transient local creation failures check ownership then retry at most three attempts', async () => {
  const { createLocalAuthFixture } = await load()
  const sequence = []
  let creates = 0
  const result = await createLocalAuthFixture({ email,
    createUser: async () => {
      sequence.push('create'); creates++
      return creates < 3 ? { data: { user: null }, error: { status: creates === 1 ? 503 : 0 } }
        : { data: { user: { id: 'third-attempt' } }, error: null }
    },
    findUserByEmail: async requested => { assert.equal(requested, email); sequence.push('lookup'); return null },
    pause: async () => { sequence.push('pause') },
  })
  assert.deepEqual(sequence, ['create', 'lookup', 'pause', 'create', 'lookup', 'pause', 'create'])
  assert.deepEqual(result, { user: { id: 'third-attempt' }, retries: 2, recovered: false })
})

test('permanent create failures do not retry or recover another account', async () => {
  const { createLocalAuthFixture } = await load()
  let creates = 0
  await assert.rejects(createLocalAuthFixture({ email,
    createUser: async () => { creates++; return { data: { user: null }, error: { status: 422, message: 'sensitive details' } } },
    findUserByEmail: async () => assert.fail('4xx must not recover'), pause: noPause,
  }), error => error.code === 'local_auth_fixture_create_failed' && error.retries === 0 && !String(error).includes('sensitive'))
  assert.equal(creates, 1)
})

test('exhausted create failures still recover the last ambiguous response and otherwise fail safely', async () => {
  const { createLocalAuthFixture } = await load()
  for (const recoverLast of [false, true]) {
    let creates = 0, lookups = 0
    const pending = createLocalAuthFixture({ email,
      createUser: async () => { creates++; return { error: { status: 500, message: 'secret' } } },
      findUserByEmail: async () => { lookups++; return recoverLast && lookups === 3 ? { id: 'last-id' } : null }, pause: noPause,
    })
    if (recoverLast) assert.deepEqual(await pending, { user: { id: 'last-id' }, retries: 2, recovered: true })
    else await assert.rejects(pending, error => error.code === 'local_auth_fixture_create_failed' && error.retries === 2 && !String(error).includes('secret'))
    assert.equal(creates, 3)
    assert.equal(lookups, 3)
  }
})

test('failed ownership lookup stops creation with a controlled error', async () => {
  const { createLocalAuthFixture } = await load()
  let creates = 0
  await assert.rejects(createLocalAuthFixture({ email,
    createUser: async () => { creates++; return { error: { status: 503 } } },
    findUserByEmail: async () => { throw new Error('database credential details') }, pause: noPause,
  }), error => error.code === 'local_auth_fixture_create_failed' && !String(error).includes('credential'))
  assert.equal(creates, 1)
})

test('local sign-in requires a real provider session and retries transient failures only', async () => {
  const { signInLocalAuthFixture } = await load()
  let attempts = 0, pauses = 0
  const result = await signInLocalAuthFixture({ signIn: async () => {
    attempts++
    if (attempts === 1) throw new TypeError('transport failed')
    if (attempts === 2) return { error: { status: 502 } }
    return { data: { session: { access_token: 'provider-session' } }, error: null }
  }, pause: async () => { pauses++ } })
  assert.equal(attempts, 3)
  assert.equal(pauses, 2)
  assert.deepEqual(result, { session: { access_token: 'provider-session' }, retries: 2 })
})

test('wrong credentials and missing provider sessions never pass local sign-in', async () => {
  const { signInLocalAuthFixture } = await load()
  for (const result of [
    { error: { status: 400, message: 'credential details' } },
    { data: { session: null }, error: null },
    { data: { session: {} }, error: null },
    { data: { session: { access_token: '' } }, error: null },
  ]) {
    let attempts = 0
    await assert.rejects(signInLocalAuthFixture({ signIn: async () => { attempts++; return result }, pause: noPause }),
      error => error.code === 'local_auth_fixture_sign_in_failed' && error.retries === 0 && !String(error).includes('credential'))
    assert.equal(attempts, 1)
  }
})

test('exhausted sign-in retries remain bounded and expose no provider details', async () => {
  const { signInLocalAuthFixture } = await load()
  let attempts = 0
  await assert.rejects(signInLocalAuthFixture({ signIn: async () => { attempts++; return { error: { status: 0, message: 'secret' } } }, pause: noPause }),
    error => error.code === 'local_auth_fixture_sign_in_failed' && error.retries === 2 && !String(error).includes('secret'))
  assert.equal(attempts, 3)
})
