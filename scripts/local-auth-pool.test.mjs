import test from 'node:test'
import assert from 'node:assert/strict'
import { configureLocalAuthPool } from './local-auth-pool.mjs'

const id = 'a'.repeat(64)
const started = '2026-11-15T12:00:00Z'
const fixture = () => ({ Id: id, Config: { Image: 'public.ecr.aws/supabase/gotrue:v2.197.0', WorkingDir: '/', Labels: { 'com.supabase.cli.project': 'saathi-qa-20261105' }, Env: ['GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:private-password@supabase_db_saathi-qa-20261105:5432/postgres'] }, State: { Running: true, StartedAt: started }, NetworkSettings: { Networks: { 'supabase_network_saathi-qa-20261105': {} } } })
function harness({ container = fixture(), reused = false, foreign = false, restartFails = false, initialConfigured = false, invalidFreshLimits = false, lostInstall = false, superseded = false } = {}) {
  const calls = []; let restarted = false, ownsLink = false
  const run = async (args, input) => {
    calls.push({ args, input })
    if (args[0] === 'inspect') return JSON.stringify([{ ...container, State: { ...container.State, StartedAt: restarted ? '2026-11-15T12:01:00Z' : started } }])
    if (args[0] === 'logs') { const configured = initialConfigured || (restarted && !invalidFreshLimits); const first = JSON.stringify({ time: started, limit_strategy: 'fixed', limit_max_open_conns: configured ? 10 : 0, limit_max_idle_conns: configured ? 10 : 0 }); return first + (superseded ? '\n' + JSON.stringify({ time: '2026-11-15T12:02:00Z', limit_strategy: 'fixed', limit_max_open_conns: 0, limit_max_idle_conns: 0 }) : '') }
    if (args[0] === 'restart') { if (restartFails) throw Error('private-password'); restarted = true; return '' }
    if (args.includes('install')) { if (foreign) throw Error('private-password'); ownsLink = !reused; if (lostInstall) throw Error('private-password'); return reused ? 'reused' : 'created' }
    if (args.includes('rollback')) { const outcome = ownsLink ? 'removed' : 'preserved'; ownsLink = false; return outcome }
    return ''
  }
  return { calls, run }
}
test('zero-idle Auth gets a bounded reusable pool, exact-ID restart and fresh verification', async () => {
  const h = harness()
  const result = await configureLocalAuthPool({ run: h.run, healthy: async () => true })
  assert.equal(result.created, true)
  assert.equal(result.maxOpen, 10); assert.equal(result.maxIdle, 10)
  assert.deepEqual(h.calls.find(c => c.args[0] === 'restart').args, ['restart', id])
  assert.ok(h.calls.filter(c => c.args[0] !== 'inspect').every(c => c.args.includes(id)))
  assert.match(h.calls.find(c => c.input)?.input, /GOTRUE_DB_MAX_IDLE_POOL_SIZE=10/)
  assert.ok(h.calls.filter(c => c.args[0] === 'exec').every(c => c.args.includes('0:0')))
  assert.ok(h.calls.some(c => c.args[0] === 'logs' && c.args.includes(started)))
  assert.ok(h.calls.some(c => c.args.includes('cleanup')))
})
test('verified reused configuration avoids restart while stale fresh limits fail closed', async () => {
  const reused = harness({ reused: true, initialConfigured: true })
  assert.equal((await configureLocalAuthPool({ run: reused.run, healthy: async () => true })).created, false)
  assert.ok(!reused.calls.some(c => c.args[0] === 'restart'))
  const stale = harness({ invalidFreshLimits: true })
  await assert.rejects(configureLocalAuthPool({ run: stale.run, healthy: async () => true }))
  assert.ok(stale.calls.some(c => c.args.includes('rollback')))
  assert.ok(stale.calls.some(c => c.args[0] === 'logs' && c.args.includes('2026-11-15T12:01:00Z')))
})
test('foreign projects, database routes, images and overriding limits are rejected before mutation', async () => {
  for (const mutate of [c => c.Config.Labels['com.supabase.cli.project'] = 'production', c => c.Config.Image = 'gotrue:latest', c => c.Config.Env[0] = 'GOTRUE_DB_DATABASE_URL=postgresql://user:private-password@remote.example/postgres', c => c.Config.Env.push('GOTRUE_DB_MAX_IDLE_POOL_SIZE=0'), c => c.Config.Env.push('GOTRUE_DB_CONN_PERCENTAGE=50')]) {
    const container = fixture(); mutate(container); const h = harness({ container })
    await assert.rejects(configureLocalAuthPool({ run: h.run, healthy: async () => true }), error => !/private-password|remote.example/.test(error.message))
    assert.equal(h.calls.length, 1)
  }
})
test('foreign config is preserved and a failed restart rolls back only a newly created file', async () => {
  const foreign = harness({ foreign: true })
  await assert.rejects(configureLocalAuthPool({ run: foreign.run, healthy: async () => true }))
  assert.ok(!foreign.calls.some(c => c.args[0] === 'restart'))
  for (const reused of [false, true]) {
    const h = harness({ reused, restartFails: true })
    await assert.rejects(configureLocalAuthPool({ run: h.run, healthy: async () => true }), error => !error.message.includes('private-password'))
    assert.equal(h.calls.filter(c => c.args[0] === 'restart').length, reused ? 1 : 2)
    assert.ok(h.calls.some(c => c.args.includes('cleanup')))
  }
})
test('lost install responses reconcile ownership and a newer zero-limit record cannot pass', async () => {
  for (const options of [{ lostInstall: true }, { initialConfigured: true, superseded: true }]) {
    const h = harness(options)
    await assert.rejects(configureLocalAuthPool({ run: h.run, healthy: async () => true }))
    assert.ok(h.calls.some(c => c.args.includes('rollback')))
    assert.ok(h.calls.some(c => c.args[0] === 'restart'))
    assert.ok(h.calls.some(c => c.args.includes('cleanup')))
  }
})
