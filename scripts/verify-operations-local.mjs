// Disposable SQL/outbox recovery drills. Never accepts a hosted database.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import postgres from 'postgres'
import { startLocalRedisRest } from './local-redis-rest.mjs'

const url = new URL(process.env.DATABASE_TEST_URL || 'http://unconfigured.invalid')
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname === '127.0.0.1' && url.port === '55439' && url.pathname === '/postgres', 'Operations drills require the disposable loopback SQL fixture on port 55439')
const container = 'saathi-implementation-db-v1'
const docker = args => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] })
const [infrastructure] = JSON.parse(docker(['inspect', container]))
assert.equal(infrastructure.Config.Labels['com.docker.compose.service'], 'postgres')
assert.equal(infrastructure.HostConfig.PortBindings['5432/tcp'][0].HostPort, '55439')
const runId = randomUUID(), actorId = randomUUID(), commandId = randomUUID()
const restoredName = `saathi_restore_${runId.replaceAll('-', '')}`, marker = `saathi.operations.verify=${runId}`
const archive = `/tmp/saathi-operations-${runId}.dump`
const evidenceDirectory = `.local-test/operations-${runId}`
const db = postgres(url.href, { max: 1, prepare: false })
let bridge, applicationDb, restoredDb, workspaceId, restoreCreated = false, passed = false, phase = 'empty-fixture-check'
const evidence = { runId, redisOutageRecovery: false, backupRestore: false, fixtureCleanup: false }
const ownedWorkspaceIds = new Set()
try {
  const [before] = await db`SELECT (SELECT count(*)::int FROM profiles) AS profiles,(SELECT count(*)::int FROM workspaces) AS workspaces`
  assert.deepEqual(before, { profiles: 0, workspaces: 0 }, 'Drills require an empty disposable fixture')
  const token = randomUUID()
  bridge = await startLocalRedisRest({ token })
  Object.assign(process.env, { DATABASE_URL: url.href, UPSTASH_REDIS_REST_URL: bridge.url, UPSTASH_REDIS_REST_TOKEN: token, USE_MOCK_REDIS: 'false' })
  const { require: load } = await import('tsx/cjs/api')
  const { createWorkspaceRecord } = load('../lib/data/workspaces.ts', import.meta.url)
  const { createTaskRecord } = load('../lib/data/tasks.ts', import.meta.url)
  const { flushOutbox } = load('../lib/data/events.ts', import.meta.url)
  applicationDb = load('../lib/db/client.ts', import.meta.url).getDb()
  await db`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${actorId},${`operations-${runId}@example.test`},${db.json({ username: 'Operations fixture' })})`
  assert.equal((await db`SELECT id FROM profiles WHERE id=${actorId}`).length, 1)
  const workspace = await createWorkspaceRecord(actorId, { name: 'Operations recovery fixture' })
  workspaceId = workspace.id
  phase = 'redis-outage-recovery'
  bridge.outage(true)
  const task = await createTaskRecord(actorId, workspaceId, { title: 'Recover delivery after outage' }, commandId)
  const unavailable = await flushOutbox(workspaceId)
  assert.ok(unavailable.failed >= 1 || unavailable.unavailable)
  assert.equal((await db`SELECT id FROM tasks WHERE id=${task.id} AND workspace_id=${workspaceId}`).length, 1)
  assert.equal((await db`SELECT command_id FROM command_receipts WHERE workspace_id=${workspaceId} AND command_id=${commandId}`).length, 1)
  assert.ok((await db`SELECT id FROM outbox_events WHERE workspace_id=${workspaceId} AND published_at IS NULL`).length >= 2)
  bridge.outage(false)
  const recovered = await flushOutbox(workspaceId)
  assert.equal(recovered.failed, 0)
  assert.ok(recovered.published >= 2)
  assert.equal((await db`SELECT id FROM outbox_events WHERE workspace_id=${workspaceId} AND published_at IS NULL`).length, 0)
  assert.ok((await bridge.command(['XLEN', `stream:${workspaceId}`])) >= 2)
  evidence.redisOutageRecovery = true

  phase = 'backup-restore'
  docker(['exec', container, 'pg_dump', '-U', 'postgres', '--format=custom', '--file', archive, 'postgres'])
  assert.match(restoredName, /^saathi_restore_[0-9a-f]{32}$/)
  await db.unsafe(`CREATE DATABASE "${restoredName}"`)
  restoreCreated = true
  await db.unsafe(`COMMENT ON DATABASE "${restoredName}" IS '${marker}'`)
  docker(['exec', container, 'pg_restore', '-U', 'postgres', '--no-owner', '--exit-on-error', '--dbname', restoredName, archive])
  const restoredUrl = new URL(url); restoredUrl.pathname = '/' + restoredName
  restoredDb = postgres(restoredUrl.href, { max: 1, prepare: false })
  for (const table of ['profiles', 'workspaces', 'workspace_members', 'tasks', 'activity_events', 'outbox_events', 'command_receipts']) {
    const source = await db.unsafe(`SELECT * FROM ${table} ORDER BY 1,2`)
    const restored = await restoredDb.unsafe(`SELECT * FROM ${table} ORDER BY 1,2`)
    assert.deepEqual([...restored], [...source], `Restore must preserve ${table}`)
  }
  evidence.backupRestore = true
  passed = true
} catch {
  evidence.failurePhase = phase
  console.error('Disposable operations verification failed; no hosted resources were used.')
} finally {
  const cleanupFailures = []
  const clean = async (stage, operation) => { try { await operation() } catch { cleanupFailures.push(stage); passed = false } }
  await clean('restore-connection', () => restoredDb?.end({ timeout: 5 }))
  await clean('restore-database', async () => { if (restoreCreated) {
    const [owned] = await db`SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=${restoredName}`
    assert.equal(owned.marker, marker)
    await db.unsafe(`DROP DATABASE "${restoredName}" WITH (FORCE)`)
  } })
  await clean('backup-file', () => docker(['exec', container, 'rm', '-f', archive]))
  await clean('workspace', async () => {
    const owned = await db`SELECT id FROM workspaces WHERE owner_user_id=${actorId} AND name='Operations recovery fixture'
      UNION SELECT workspace_id AS id FROM activity_events WHERE actor_user_id=${actorId}`
    if (workspaceId) ownedWorkspaceIds.add(workspaceId)
    for (const row of owned) ownedWorkspaceIds.add(row.id)
    for (const id of ownedWorkspaceIds) {
      if (bridge) await bridge.command(['DEL', `stream:${id}`])
      await db`DELETE FROM outbox_events WHERE workspace_id=${id}`
      await db`DELETE FROM activity_events WHERE workspace_id=${id} AND actor_user_id=${actorId}`
      await db`DELETE FROM workspaces WHERE id=${id} AND owner_user_id=${actorId}`
    }
  })
  await clean('identity', async () => {
    await db`DELETE FROM profiles WHERE id=${actorId}`
    await db`DELETE FROM auth.users WHERE id=${actorId} AND email=${`operations-${runId}@example.test`}`
  })
  await clean('absence-check', async () => {
    const [remaining] = await db`SELECT (SELECT count(*)::int FROM profiles WHERE id=${actorId}) AS profiles,(SELECT count(*)::int FROM workspaces WHERE owner_user_id=${actorId}) AS workspaces,(SELECT count(*)::int FROM auth.users WHERE id=${actorId}) AS users`
    assert.deepEqual(remaining, { profiles: 0, workspaces: 0, users: 0 })
    assert.equal((await db`SELECT id FROM activity_events WHERE actor_user_id=${actorId}`).length, 0)
    for (const id of ownedWorkspaceIds) assert.equal((await db`SELECT id FROM outbox_events WHERE workspace_id=${id}`).length, 0)
    assert.equal((await db`SELECT datname FROM pg_database WHERE datname=${restoredName}`).length, 0)
  })
  await clean('application-connection', () => applicationDb?.end({ timeout: 5 }))
  await clean('database-connection', () => db.end({ timeout: 5 }))
  await clean('redis-bridge', () => bridge?.close())
  evidence.fixtureCleanup = cleanupFailures.length === 0
  evidence.cleanupFailures = cleanupFailures
  mkdirSync(evidenceDirectory, { recursive: true })
  writeFileSync(`${evidenceDirectory}/result.json`, JSON.stringify({ ...evidence, passed }, null, 2) + '\n')
  console.log(JSON.stringify({ ...evidence, passed }))
}
if (!passed) process.exitCode = 1
