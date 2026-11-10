const assert = require('node:assert/strict')
const test = require('node:test')

const status = { API_URL: 'http://127.0.0.1:56321', DB_URL: 'postgresql://postgres:private-password@127.0.0.1:56322/postgres',
  PUBLISHABLE_KEY: 'sb_publishable_disposable_public', SECRET_KEY: 'sb_secret_disposable_admin', JWT_SECRET: 'private-jwt-secret' }

test('preparation rejects remote or wrong-project endpoints before migration or build', async () => {
  const { prepareNfr } = await import('./prepare-nfr-local.mjs')
  for (const override of [{ API_URL: 'https://remote.example.test' }, { API_URL: 'http://127.0.0.1:54321' },
    { DB_URL: 'postgresql://private-password@remote.example.test/postgres' }, { DB_URL: 'postgresql://postgres:private-password@127.0.0.1:54322/postgres' },
    { API_URL: 'http://127.0.0.1:56321/other' }, { API_URL: 'http://user:private-password@127.0.0.1:56321' }]) {
    const calls = []
    await assert.rejects(prepareNfr({ env: {}, run: async (...args) => { calls.push(args); return JSON.stringify({ ...status, ...override }) }, log() {} }),
      error => !error.message.includes('private-password') && !error.message.includes('remote.example'))
    assert.equal(calls.length, 1)
  }
})

test('preparation runs real migrations and default production build using private child environments', async () => {
  const { prepareNfr } = await import('./prepare-nfr-local.mjs')
  const calls = [], logs = []
  const parent = { PATH: 'tools', HOME: 'home', GITHUB_TOKEN: 'private-github', OPENAI_API_KEY: 'private-openai',
    DATABASE_URL: 'postgresql://private-production', DATABASE_POOL_MAX: '10', RATE_LIMIT_TASKS_MAX: '999999', SSE_MAX_CONNECTIONS: '999999', SAATHI_QA_SUPABASE_CLI: '/tools/supabase' }
  const before = { ...parent }
  await prepareNfr({ env: parent, run: async (...args) => { calls.push(args); return calls.length === 1 ? JSON.stringify(status) : '' }, log: value => logs.push(value) })
  assert.deepEqual(parent, before)
  assert.deepEqual(calls[0].slice(0, 2), ['/tools/supabase', ['status', '--workdir', '.local-test/supabase-acceptance', '-o', 'json']])
  assert.equal(calls[0][2].capture, true)
  assert.deepEqual(calls[1][1], ['scripts/migrate-database.mjs'])
  assert.equal(calls[1][2].env.DATABASE_MIGRATION_URL, status.DB_URL)
  assert.deepEqual(calls[2][1], ['scripts/validate-env.js'])
  assert.deepEqual(calls[3][1], ['node_modules/next/dist/bin/next', 'build'])
  for (const [, , options] of calls) {
    for (const key of ['GITHUB_TOKEN', 'OPENAI_API_KEY', 'DATABASE_POOL_MAX', 'RATE_LIMIT_TASKS_MAX', 'SSE_MAX_CONNECTIONS', 'SUPABASE_SERVICE_ROLE_KEY']) assert.equal(options.env[key], undefined)
    assert.ok(!Object.values(options.env).includes(status.SECRET_KEY))
  }
  const build = calls[3][2].env
  assert.equal(build.NEXT_PUBLIC_SUPABASE_URL, status.API_URL)
  assert.equal(build.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, status.PUBLISHABLE_KEY)
  assert.equal(build.SAATHI_BUILD_WORKERS, '1')
  assert.equal(build.ENABLE_AI_WORKSPACE, 'false')
  assert.equal(build.NEXT_PUBLIC_ENABLE_AI_WORKSPACE, 'false')
  assert.equal(build.DATABASE_MIGRATION_URL, undefined)
  assert.doesNotMatch(logs.join('\n'), /private-|sb_secret_/)
})

test('preparation accepts IPv6 loopback and legacy anon public keys without exposing captured status', async () => {
  const { prepareNfr } = await import('./prepare-nfr-local.mjs')
  const anon = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`
  let calls = 0
  const logs = []
  await prepareNfr({ env: {}, run: async () => ++calls === 1 ? JSON.stringify({ ...status, API_URL: 'http://[::1]:56321', DB_URL: 'postgres://postgres:private-password@[::1]:56322/postgres', PUBLISHABLE_KEY: undefined, ANON_KEY: anon }) : '', log: value => logs.push(value) })
  assert.equal(calls, 4)
  assert.ok(!logs.join('').includes(anon))
})

test('secret-role credentials cannot be selected as the public build key', async () => {
  const { prepareNfr } = await import('./prepare-nfr-local.mjs')
  for (const key of [status.SECRET_KEY, `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`]) {
    let calls = 0
    await assert.rejects(prepareNfr({ env: {}, run: async () => { calls++; return JSON.stringify({ ...status, PUBLISHABLE_KEY: key }) }, log() {} }))
    assert.equal(calls, 1)
  }
})

test('child diagnostics retain safe output and redact credentials without leaking child errors', async () => {
  const { runCommand } = await import('./prepare-nfr-local.mjs')
  const output = []
  const options = { env: {}, redactions: ['private-password'], emit: value => output.push(value) }
  await assert.rejects(runCommand(process.execPath, ['-e', "console.log('compile phase');console.error('private-password');process.exit(1)"], options),
    error => !error.message.includes('private-password'))
  assert.match(output.join(''), /compile phase/)
  assert.doesNotMatch(output.join(''), /private-password/)
  output.length = 0
  assert.equal(await runCommand(process.execPath, ['-e', "console.log('private-password')"], { ...options, capture: true }), 'private-password\n')
  assert.deepEqual(output, [])
})

test('migration failure stops preparation and reports only its safe phase', async () => {
  const { prepareNfr } = await import('./prepare-nfr-local.mjs')
  let calls = 0
  await assert.rejects(prepareNfr({ env: {}, run: async () => { if (++calls === 1) return JSON.stringify(status); throw new Error('private-password private-jwt-secret') }, log() {} }),
    error => /migration/.test(error.message) && !error.message.includes('private-'))
  assert.equal(calls, 2)
})
