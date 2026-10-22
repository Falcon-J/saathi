// Local integration verifier. --smoke and --diagnostic cannot establish NFR acceptance.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { startLocalRedisRest } from './local-redis-rest.mjs'

assert.ok(process.argv.slice(2).every(arg => ['--smoke', '--diagnostic'].includes(arg)), 'Only --smoke or --diagnostic is supported')
const smoke = process.argv.includes('--smoke')
const diagnostic = process.argv.includes('--diagnostic')
assert.ok(!(smoke && diagnostic), 'Choose either smoke or diagnostic')
const acceptance = !smoke && !diagnostic
const mode = smoke ? 'smoke' : diagnostic ? 'diagnostic' : 'acceptance'
const envelope = smoke ? { users: 8, members: 2, writes: 8, seconds: 8, seed: 2 } : diagnostic ? { users: 100, members: 25, writes: 100, seconds: 60, seed: 750 } : { users: 100, members: 25, writes: 1000, seconds: 900, seed: 750 }
const runId = randomUUID(), base = 'http://127.0.0.1:3101'
const directory = `.local-test/nfr-${runId}`
mkdirSync(directory, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
const users = [], workspaces = Array.from({ length: 4 }, () => randomUUID()), observers = [], mutations = [], errors = []
const samples = { warmRead: [], read: [], write: [], admission: [], deliveryUpperBound: [], scheduleLag: [] }
const timingLimit = 60000, timingBuffer = [], eventSlots = new Map()
const eventLoop = monitorEventLoopDelay({ resolution: 20 })
let timingCount = 0, timingDropped = 0, workloadStarted = null, workloadEnded = null, writesAttempted = 0, fingerprint = null
let db, admin, bridge, server, log, stopping = false, attempts = 0, readAttempts = 0, streamAttempts = 0, duplicateNotifications = 0, phase = 'preflight', backgroundReads
function timing(sample) {
  if (timingCount >= timingLimit) { timingDropped++; return }
  // Fixed allowlist: never persist credentials, request bodies, task titles or Auth identifiers.
  const allowed = ['kind', 'action', 'category', 'at', 'startedAt', 'durationMs', 'status', 'success', 'actorSlot', 'workspaceSlot', 'eventSlot', 'duplicate', 'scheduledOffsetMs', 'scheduleLagMs']
  timingBuffer.push(JSON.stringify(Object.fromEntries(allowed.filter(key => sample[key] !== undefined).map(key => [key, sample[key]]))))
  timingCount++
  if (timingBuffer.length >= 128) flushTimings()
}
function flushTimings() { if (timingBuffer.length) appendFileSync(`${directory}/timings.jsonl`, timingBuffer.splice(0).join('\n') + '\n') }
function workloadStats() {
  const elapsedMs = workloadStarted === null ? 0 : Math.max(0, (workloadEnded ?? performance.now()) - workloadStarted)
  return { elapsedMs: Math.round(elapsedMs), intendedWriteRatePerSecond: envelope.writes / envelope.seconds, attemptedWrites: writesAttempted, achievedWriteRatePerSecond: elapsedMs ? mutations.length * 1000 / elapsedMs : 0, attemptedWriteRatePerSecond: elapsedMs ? writesAttempted * 1000 / elapsedMs : 0, scheduleLag: summary(samples.scheduleLag) }
}
const deliveryCounts = () => ({ expected: envelope.writes * envelope.members, observed: observers.reduce((sum, observer) => sum + observer.seen.size, 0), missing: Math.max(0, envelope.writes * envelope.members - observers.reduce((sum, observer) => sum + observer.seen.size, 0)), duplicateNotifications })
const progress = () => writeFileSync(`${directory}/progress.json`, JSON.stringify({ runId, phase, mode, envelope, ...workloadStats(), identitiesCreated: users.length, identitiesSignedIn: users.filter(user => user.cookie).length, observersReady: observers.filter(observer => observer.ready && observer.connected).length, attemptedRequests: attempts, successfulMutations: mutations.length, errors: errors.length, deliveries: deliveryCounts(), updatedAt: new Date().toISOString() }, null, 2))
const percentile = (values, quantile) => values.length ? Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * quantile) - 1]) : null
const summary = values => ({ count: values.length, p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), p99Ms: percentile(values, .99) })
function loopback(value, protocols) {
  const url = new URL(value)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && protocols.includes(url.protocol), 'Expected loopback stack')
  return value
}
async function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.on('error', () => reject(new Error('Local CLI could not start')))
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error('Local CLI status failed')))
  })
}
async function until(check, timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await check()) return; await pause(100) }
  throw new Error('Timed out waiting for local verification condition')
}
async function runWrites(users, count, started, duration, write, now = () => performance.now(), sleep = pause) {
  await Promise.all(users.map(async (user, userIndex) => {
    for (let index = userIndex; index < count; index += users.length) {
      const intendedAt = started + index * duration / count
      await sleep(Math.max(0, intendedAt - now()))
      await write(user, index, intendedAt)
    }
  }))
}
// The built action results are plain JSON objects. Follow the RSC action reference instead of assuming a row number.
function actionResult(body) {
  const rows = new Map()
  for (const line of body.split('\n')) {
    const match = /^([0-9a-f]+):(\{.*\})$/.exec(line)
    if (match) { try { rows.set(match[1], JSON.parse(match[2])) } catch { /* Non-JSON Flight rows are not action results. */ } }
  }
  const root = rows.get('0')
  assert.match(root?.a ?? '', /^\$@[0-9a-f]+$/, 'Missing RSC action result reference')
  const result = rows.get(root.a.slice(2))
  assert.ok(result && typeof result === 'object', 'Missing RSC action result')
  assert.equal(result.success, true, `Server Action failed (${result.code ?? 'unknown'})`)
  return result
}
assert.equal(actionResult('0:{"a":"$@2"}\n2:{"success":true,"task":{"id":"fixture"}}\n').task.id, 'fixture')
assert.throws(() => actionResult('0:{"a":"$@1"}\n1:{"error":"Denied"}'))

let actions
async function action(user, name, args, category) {
  attempts++
  const started = performance.now(), startedAt = new Date().toISOString()
  let status = null, success = false
  try {
    const response = await fetch(`${base}/dashboard`, {
      method: 'POST', headers: { cookie: user.cookie, Origin: base, 'Next-Action': actions[name], 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(30000), redirect: 'error',
    })
    status = response.status
    const body = await response.text()
    assert.equal(response.status, 200, `Server Action HTTP ${response.status}`)
    const result = actionResult(body)
    success = true
    return result
  } finally {
    const durationMs = performance.now() - started
    samples[category].push(durationMs)
    timing({ kind: 'request', action: name, category, startedAt, at: new Date().toISOString(), durationMs, status, success, actorSlot: users.indexOf(user), workspaceSlot: workspaces.indexOf(user.workspace) })
  }
}
async function read(user, category = 'read') {
  for (const [name, args] of [['getTasksPage', [user.workspace, { limit: 50 }]], ['getWorkspaceTaskAggregates', [user.workspace]]]) {
    readAttempts++
    try { await action(user, name, args, category); user.reads++ } catch { errors.push({ phase: category, actorSlot: users.indexOf(user), action: name }) }
  }
}
async function observe(observer) {
  while (!stopping) {
    const controller = new AbortController()
    observer.controller = controller
    const timer = setTimeout(() => controller.abort(), 30000)
    const started = performance.now(), startedAt = new Date().toISOString()
    let admissionRecorded = false
    try {
      attempts++; streamAttempts++
      const response = await fetch(`${base}/api/realtime?workspaceId=${observer.user.workspace}`, {
        headers: { cookie: observer.user.cookie, Accept: 'text/event-stream', ...(observer.lastId ? { 'Last-Event-ID': observer.lastId } : {}) }, signal: controller.signal,
      })
      clearTimeout(timer)
      timing({ kind: 'request', action: 'SSE admission', category: 'admission', startedAt, at: new Date().toISOString(), durationMs: performance.now() - started, status: response.status, success: response.status === 200, actorSlot: users.indexOf(observer.user), workspaceSlot: workspaces.indexOf(observer.user.workspace) })
      admissionRecorded = true
      samples.admission.push(performance.now() - started)
      assert.equal(response.status, 200, `SSE admission ${response.status}`)
      observer.connections++
      const reader = response.body.getReader(), decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
        const blocks = buffer.split('\n\n'); buffer = blocks.pop()
        for (const block of blocks) {
          const lines = block.split('\n'), id = lines.find(line => line.startsWith('id:'))
          if (id) observer.lastId = id.slice(3).trim()
          const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
          if (!data) continue
          const event = JSON.parse(data)
          if (event.type === 'connected') { observer.ready = true; observer.connected = true }
          if (event.type === 'resync-required') errors.push({ phase: 'stream-resync', actorSlot: users.indexOf(observer.user) })
          if (event.type !== 'task-created') continue
          assert.equal(event.workspaceId, observer.user.workspace, 'Cross-workspace delivery')
          assert.ok(event.data?.eventId && Number.isFinite(event.timestamp), 'Expected durable event identity and timestamp')
          if (!eventSlots.has(event.data.eventId)) eventSlots.set(event.data.eventId, eventSlots.size)
          const delay = Date.now() - event.timestamp
          timing({ kind: 'event', at: new Date().toISOString(), durationMs: delay, actorSlot: users.indexOf(observer.user), workspaceSlot: workspaces.indexOf(observer.user.workspace), eventSlot: eventSlots.get(event.data.eventId), duplicate: observer.seen.has(event.data.eventId) })
          if (!observer.seen.has(event.data.eventId)) {
            assert.ok(delay >= 0, 'Event clock mismatch; negative delivery interval')
            observer.seen.add(event.data.eventId)
            samples.deliveryUpperBound.push(delay)
          } else duplicateNotifications++
        }
      }
    } catch {
      if (!admissionRecorded) {
        const durationMs = performance.now() - started
        samples.admission.push(durationMs)
        timing({ kind: 'request', action: 'SSE admission', category: 'admission', startedAt, at: new Date().toISOString(), durationMs, status: null, success: false, actorSlot: users.indexOf(observer.user), workspaceSlot: workspaces.indexOf(observer.user.workspace) })
      }
      if (!stopping) errors.push({ phase: 'stream', actorSlot: users.indexOf(observer.user) })
    } finally { clearTimeout(timer); controller.abort(); observer.connected = false }
    if (!stopping) await pause(1000)
  }
}

let result
try {
  const hash = value => createHash('sha256').update(value).digest('hex')
  fingerprint = { revision: (await capture('git', ['rev-parse', 'HEAD'])).trim(), workingDiffSha256: hash(await capture('git', ['diff', '--binary', 'HEAD', '--', '.'])), verifierSha256: hash(readFileSync('scripts/verify-nfr-local.mjs')), builtActionManifestSha256: hash(readFileSync('.next/server/server-reference-manifest.json')), recordedAt: new Date().toISOString() }
  writeFileSync(`${directory}/revision.json`, JSON.stringify(fingerprint, null, 2))
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx'
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npx.cmd --yes supabase@2.120.0 status --workdir .local-test/supabase-acceptance -o json'] : ['--yes', 'supabase@2.120.0', 'status', '--workdir', '.local-test/supabase-acceptance', '-o', 'json']
  const status = JSON.parse(await capture(command, args))
  const api = loopback(status.API_URL, ['http:']), database = loopback(status.DB_URL, ['postgresql:', 'postgres:'])
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY, adminKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY
  assert.ok(publicKey && adminKey, 'Local Auth keys unavailable')
  await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', () => reject(new Error('Port 3101 is already occupied')))
    probe.listen(3101, '127.0.0.1', () => probe.close(resolve))
  })
  const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8')).node
  actions = Object.fromEntries(['addTask', 'getTasksPage', 'getWorkspaceTaskAggregates'].map(name => {
    const matches = Object.entries(manifest).filter(([, value]) => value.exportedName === name && /app[\\/]tasks[\\/]actions\.ts$/.test(value.filename))
    assert.equal(matches.length, 1, `Build must expose exactly one ${name} action`)
    return [name, matches[0][0]]
  }))
  db = postgres(database, { max: 1, prepare: false })
  admin = createClient(api, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
  phase = 'local-auth-fixtures'
  progress()
  for (let index = 0; index < envelope.users; index++) {
    const email = `nfr-${runId}-${index}@example.test`, password = randomUUID() + 'Aa9!'
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: 'Disposable NFR member' } })
    assert.ok(!created.error && created.data.user, 'Local Auth identity creation failed')
    const user = { id: created.data.user.id, email, workspace: workspaces[Math.floor(index / envelope.members)], reads: 0, writes: 0 }
    users.push(user)
    const jar = new Map()
    const client = createServerClient(api, publicKey, { cookies: { getAll: () => Array.from(jar, ([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => jar.set(name, value)) } })
    const signed = await client.auth.signInWithPassword({ email, password })
    assert.ok(!signed.error && signed.data.session, 'Local real password sign-in failed')
    user.cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ')
    progress()
  }
  await db.begin(async tx => {
    for (const workspace of workspaces) {
      const members = users.filter(user => user.workspace === workspace), owner = members[0]
      await tx`INSERT INTO workspaces(id,name,owner_user_id) VALUES(${workspace},'Disposable local NFR fixture',${owner.id})`
      for (const user of members) await tx`INSERT INTO workspace_members(workspace_id,user_id) VALUES(${workspace},${user.id})`
      for (let index = 0; index < envelope.seed; index++) await tx`INSERT INTO tasks(id,workspace_id,title,priority,created_by_user_id) VALUES(${randomUUID()},${workspace},${`Seed ${index}`},'medium',${owner.id})`
    }
  })
  const token = randomUUID()
  bridge = await startLocalRedisRest({ token })
  const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: database, NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    NEXT_PUBLIC_APP_URL: base, APP_URL: base, UPSTASH_REDIS_REST_URL: bridge.url, UPSTASH_REDIS_REST_TOKEN: token, KV_REST_API_URL: bridge.url, KV_URL: bridge.url, KV_REST_API_TOKEN: token,
    CRON_SECRET: randomUUID(), GROQ_API_KEY: '', RESEND_API_KEY: '', EMAIL_FROM: '', RESEND_WEBHOOK_SECRET: '', ENABLE_AI_WORKSPACE: 'false', NEXT_PUBLIC_ENABLE_AI_WORKSPACE: 'false', ENABLE_RATE_LIMITING: 'true', ENABLE_REAL_TIME: 'true', USE_MOCK_REDIS: 'false' }
  for (const key of Object.keys(env)) if (key.startsWith('RATE_LIMIT_') || key.startsWith('SSE_') || key === 'LOAD_TEST_SECRET') delete env[key]
  if (diagnostic) env.SSE_PERFORMANCE_DIAGNOSTICS = '1'
  log = createWriteStream(`${directory}/server.log`)
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', '3101'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.pipe(log); server.stderr.pipe(log)
  await until(async () => { try { return (await fetch(`${base}/api/health/live`, { signal: AbortSignal.timeout(1000) })).ok } catch { return false } })
  phase = 'sse-admission'
  progress()
  for (const user of users) {
    const observer = { user, seen: new Set(), ready: false, connections: 0, lastId: null }
    observers.push(observer); observer.done = observe(observer)
    await pause(smoke ? 25 : 100)
  }
  await until(() => observers.every(observer => observer.ready && observer.connected), 60000)
  phase = 'warm-reads'
  progress()
  await Promise.all(users.map(async (user, index) => { await pause(index * (smoke ? 25 : 150)); await read(user, 'warmRead') }))
  assert.equal(errors.length, 0, 'Admission or warmup failed')
  assert.ok(observers.every(observer => observer.connected), 'All observers must be connected before workload starts')
  phase = 'measured-workload'
  progress()
  const started = performance.now(), duration = envelope.seconds * 1000, deadline = started + duration
  workloadStarted = started
  eventLoop.enable()
  backgroundReads = Promise.all(users.map(async (user, index) => {
    await pause(index * (smoke ? 25 : 150))
    while (!stopping && performance.now() < deadline) { await read(user); await pause(Math.min(15000, Math.max(0, deadline - performance.now()))) }
  }))
  await runWrites(users, envelope.writes, started, duration, async (user, index, intendedAt) => {
    writesAttempted++
    const scheduleLagMs = Math.max(0, performance.now() - intendedAt)
    samples.scheduleLag.push(scheduleLagMs)
    timing({ kind: 'write-schedule', at: new Date().toISOString(), actorSlot: users.indexOf(user), workspaceSlot: workspaces.indexOf(user.workspace), scheduledOffsetMs: intendedAt - started, scheduleLagMs })
    const commandId = randomUUID()
    try {
      const saved = await action(user, 'addTask', [user.workspace, `NFR ${runId} ${index}`, '', null, null, 'medium', 'today', null, null, commandId], 'write')
      assert.ok(saved.task?.id, 'Mutation returned no task')
      mutations.push({ id: saved.task.id, workspace: user.workspace, commandId })
      user.writes++
    } catch { errors.push({ phase: 'write', index }) }
    if ((index + 1) % 25 === 0 || index + 1 === envelope.writes) progress()
  })
  const workloadFinishedWithinEnvelope = mutations.length === envelope.writes && performance.now() - started <= duration + 1000
  await pause(deadline - performance.now()); await backgroundReads
  workloadEnded = performance.now()
  const elapsedMs = performance.now() - started
  phase = 'bounded-delivery-drain'
  progress()
  await until(() => observers.every(observer => observer.seen.size === envelope.writes / 4), 30000)
  phase = 'database-cross-check'
  const eventRows = await db`SELECT a.id,a.entity_id,a.workspace_id,o.published_at FROM activity_events a JOIN outbox_events o ON o.id=a.id WHERE a.workspace_id=ANY(${workspaces}::uuid[]) AND a.event_type='task-created'`
  const taskRows = await db`SELECT id,workspace_id,title FROM tasks WHERE workspace_id=ANY(${workspaces}::uuid[])`
  const receiptRows = await db`SELECT command_id,result FROM command_receipts WHERE workspace_id=ANY(${workspaces}::uuid[]) AND command_type='task-create'`
  assert.equal(mutations.length, envelope.writes); assert.equal(new Set(mutations.map(row => row.id)).size, envelope.writes)
  assert.equal(eventRows.length, envelope.writes); assert.equal(receiptRows.length, envelope.writes)
  for (const workspace of workspaces) {
    assert.equal(taskRows.filter(row => row.workspace_id === workspace).length, envelope.seed + envelope.writes / 4)
    assert.equal(mutations.filter(row => row.workspace === workspace).length, envelope.writes / 4)
  }
  const persistedTasks = new Set(taskRows.map(row => row.id)), receipts = new Set(receiptRows.map(row => row.command_id))
  for (const mutation of mutations) { assert.ok(persistedTasks.has(mutation.id)); assert.ok(receipts.has(mutation.commandId)) }
  for (const event of eventRows) {
    assert.ok(mutations.some(row => row.id === event.entity_id)); assert.ok(event.published_at)
    assert.equal(observers.filter(observer => observer.user.workspace === event.workspace_id && observer.seen.has(event.id)).length, envelope.members)
  }
  assert.equal(samples.deliveryUpperBound.length, envelope.writes * envelope.members)
  assert.equal(errors.length, 0, 'Request or stream errors occurred')
  assert.ok(users.every(user => user.reads >= 2 && user.writes > 0), 'Every identity must perform real reads and writes')
  assert.ok(elapsedMs >= duration)
  assert.ok(workloadFinishedWithinEnvelope, 'Writes did not complete within the measured workload envelope')
  if (acceptance) assert.ok(observers.every(observer => observer.connections >= 4), 'Normal four-minute SSE rotation was not observed')
  result = { passed: true, mode, scope: smoke ? 'SMOKE ONLY; not NFR evidence' : diagnostic ? 'DIAGNOSTIC ONLY; not NFR acceptance' : 'Local production, real local Supabase Auth/PostgreSQL and Redis; not hosted release evidence', runId, envelope, elapsedMs: Math.round(elapsedMs), attempts, readAttempts, streamAttempts, errors: errors.length, errorRate: errors.length / attempts,
    mutations: mutations.length, durableEvents: eventRows.length, receipts: receiptRows.length, uniqueRecipientDeliveries: samples.deliveryUpperBound.length, deliveries: deliveryCounts(), normalAdmissionLimits: true, allRolesActuallyActive: true, connections: observers.map(observer => observer.connections), timings: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, summary(values)])),
    deliveryTiming: 'Transaction-assigned event timestamp to observer receipt, conservative upper bound on commit-to-observer; not exact commit timestamp',
    performanceThresholds: { taskReadP95Ms: 750, deliveryUpperBoundP95Ms: 2000, unexpectedFailureRateExclusive: .01 }, performanceTargets: { taskReadP95Within750ms: percentile(samples.read, .95) <= 750, deliveryUpperBoundP95Within2s: percentile(samples.deliveryUpperBound, .95) <= 2000, unexpectedFailureRateBelow1Percent: errors.length / attempts < .01 }, performanceAssertionsApplied: acceptance, revocationWithin30s: 'not measured', reconciliationWithin5s: 'not measured' }
  if (acceptance && Object.values(result.performanceTargets).some(value => !value)) { result.passed = false; process.exitCode = 1 }
} catch (error) {
  result = { passed: false, mode, scope: smoke ? 'SMOKE ONLY' : diagnostic ? 'DIAGNOSTIC ONLY; not NFR acceptance' : 'Local NFR verification', runId, phase, failure: error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Local fixture or transport failed; inspect phase and scoped server log', envelope, attempts, readAttempts, streamAttempts, successfulMutations: mutations.length, deliveries: deliveryCounts(), allRolesActuallyActive: users.length === envelope.users && users.every(user => user.reads >= 2 && user.writes > 0), errors, timings: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, summary(values)])) }
  process.exitCode = 1
} finally {
  eventLoop.disable()
  result.generatorEventLoopDelay = { scope: 'Load generator process only; server loop is not measured here', samples: eventLoop.count, meanMs: eventLoop.count ? eventLoop.mean / 1e6 : null, maxMs: eventLoop.count ? eventLoop.max / 1e6 : null, p95Ms: eventLoop.count ? eventLoop.percentile(95) / 1e6 : null, p99Ms: eventLoop.count ? eventLoop.percentile(99) / 1e6 : null }
  result.workload = workloadStats()
  result.elapsedMs = result.workload.elapsedMs
  result.fingerprint = fingerprint
  result.databasePoolMax = process.env.DATABASE_POOL_MAX ?? '1'
  result.readWorkload = { scheduling: 'Response-dependent reads with 15-second think time per user', attempts: samples.read.length, achievedRequestsPerSecond: result.elapsedMs ? samples.read.length * 1000 / result.elapsedMs : 0 }
  stopping = true
  observers.forEach(observer => observer.controller?.abort())
  await Promise.allSettled(observers.map(observer => observer.done))
  await backgroundReads
  if (server) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await Promise.race([exited, pause(5000)]); if (server.exitCode === null) server.kill('SIGKILL') }
  log?.end()
  try {
    if (db) await db.begin(async tx => {
      await tx`DELETE FROM outbox_events WHERE workspace_id=ANY(${workspaces}::uuid[])`
      await tx`DELETE FROM activity_events WHERE workspace_id=ANY(${workspaces}::uuid[])`
      await tx`DELETE FROM workspaces WHERE id=ANY(${workspaces}::uuid[])`
      for (const user of users) await tx`DELETE FROM profiles WHERE id=${user.id}`
    })
    for (const user of users) { const deleted = await admin.auth.admin.deleteUser(user.id); assert.ok(!deleted.error, 'Owned local Auth fixture cleanup failed') }
    if (bridge) {
      const owned = [...workspaces, ...users.map(user => user.id), ...users.map(user => user.email)]
      const keys = new Set()
      for (const identity of owned) {
        let cursor = '0'
        do { const page = await bridge.command(['SCAN', cursor, 'MATCH', `*${identity}*`, 'COUNT', 100]); cursor = String(page[0]); for (const key of page[1]) if (key.includes(identity)) keys.add(key) } while (cursor !== '0')
      }
      const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16)
      for (const user of users) {
        // These exact hashes use the application's fixture-specific lease/rate key derivation.
        keys.add(`sse:connections:v2:${hash(user.email.trim().toLowerCase())}`)
        for (const scope of [`tasks:${user.id}`, `sse-attempt:${user.email}`]) {
          const prefix = `rate:${hash(scope)}:`
          let cursor = '0'
          do { const page = await bridge.command(['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 100]); cursor = String(page[0]); for (const key of page[1]) if (key.startsWith(prefix)) keys.add(key) } while (cursor !== '0')
        }
      }
      for (const key of keys) await bridge.command(['DEL', key])
    }
    result.cleanup = 'Owned fixture UUID rows, local Auth identities and exact identity-matching Redis keys removed; server stopped'
  } catch { result.cleanup = 'FAILED; inspect owned fixture UUIDs using runId; no broad deletion attempted'; result.passed = false; process.exitCode = 1 }
  await bridge?.close(); await db?.end()
  result.timingEvidence = { file: 'timings.jsonl', samples: timingCount, dropped: timingDropped, limit: timingLimit }
  flushTimings()
  writeFileSync(`${directory}/result.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
}
