const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")
const ts = require("typescript")

const source = fs.readFileSync("app/api/internal/outbox/route.ts", "utf8")

test("AI retention failure marks an otherwise healthy worker run as deferred", async () => {
  let failAiRetention = false
  const calls = [], warnings = []
  const outbox = { attempted: 1, published: 1, failed: 0, unavailable: false }
  const dependencies = {
    'node:crypto': require('node:crypto'),
    '@/lib/data/events': { flushOutbox: async () => { calls.push('outbox'); return outbox } },
    '@/lib/data/ai-operations': { deleteExpiredAiOperations: async () => {
      calls.push('ai-retention')
      if (failAiRetention) throw new Error('private provider details')
    } },
    '@/lib/data/retention': { deleteExpiredPublishedOutbox: async () => { calls.push('outbox-retention') } },
  }
  const exports = {}
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const secret = 'retention-worker-fixture-secret-123456'
  new Function('require', 'exports', 'process', 'console', js)(
    name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports,
    { env: { CRON_SECRET: secret } }, { warn: (...args) => warnings.push(args) },
  )
  const request = () => new Request('https://saathi.test/api/internal/outbox', {
    method: 'POST', headers: { authorization: `Bearer ${secret}` },
  })
  const healthy = await exports.POST(request())
  assert.equal(healthy.status, 200)
  assert.deepEqual(await healthy.json(), { status: 'ok', outbox })
  failAiRetention = true
  calls.length = 0
  const deferred = await exports.POST(request())
  assert.equal(deferred.status, 503)
  assert.deepEqual(await deferred.json(), { status: 'deferred', outbox })
  assert.deepEqual(calls, ['outbox', 'ai-retention', 'outbox-retention'])
  assert.deepEqual(warnings, [['[Saathi] AI operation retention cleanup deferred']])
})

test("the authenticated internal worker enforces AI metadata retention", () => {
  assert.match(source, /deleteExpiredAiOperations/)
  assert.match(source, /await deleteExpiredAiOperations\(\)/)
})

test("the internal worker exposes degraded delivery to its caller", () => {
  assert.match(source, /status: degraded \? "deferred" : "ok"/)
  assert.match(source, /status: degraded \? 503 : 200/)
  assert.match(source, /retentionDeferred \|\| outbox\.unavailable \|\| outbox\.failed > 0/)
  assert.doesNotMatch(source, /flushInvitationEmails|invitation-emails|outbox, invitations/)
})

 test("outbox cleanup is bounded and preserves pending obligations", () => {
  const retention = fs.readFileSync("lib/data/retention.ts", "utf8")
  assert.match(retention, /published_at < /)
  assert.match(retention, /LIMIT 500/)
  assert.doesNotMatch(retention, /DELETE FROM (command_receipts|activity_events|task_comments|tasks)/)
  assert.match(source, /await deleteExpiredPublishedOutbox\(\)/)
  assert.match(source, /retentionDeferred/)
})
