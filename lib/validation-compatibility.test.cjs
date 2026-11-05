const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const zod = require('zod')

function load(file, dependencies = {}, environment = {}) {
  const loaded = { exports: {} }
  const messages = []
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(code, {
    module: loaded, exports: loaded.exports,
    setInterval() {},
    require: name => name in dependencies ? dependencies[name] : require(name),
    process: { env: environment, exit: code => { throw new Error(`exit:${code}`) } },
    console: { log() {}, error: message => messages.push(message) },
  }, { filename: file })
  return { ...loaded.exports, messages }
}

test('environment defaults retain numeric and boolean output types', () => {
  const { env } = load('lib/env.ts')
  assert.equal(env.SESSION_MAX_AGE, 86400)
  assert.equal(env.RATE_LIMIT_INVITATIONS_MAX, 10)
  assert.equal(env.ENABLE_REAL_TIME, true)
  assert.equal(env.ENABLE_ANALYTICS, false)
  assert.equal(env.DEBUG, false)
})

test('invalid environment exits through validation diagnostics', () => {
  assert.throws(() => load('lib/env.ts', {}, { NODE_ENV: 'invalid' }), /exit:1/)
})

test('security input failures retain readable field errors', () => {
  const { SecurityService } = load('lib/security.ts', { './env': { getRateLimits: () => ({}) } })
  assert.throws(() => SecurityService.validateInput(zod.z.object({ title: zod.z.string() }), { title: 42 }), /Validation failed: title:/)
})

test('realtime validates arbitrary string-keyed event data', () => {
  const { normalizeRealtimeEvent } = load('lib/realtime-event.ts')
  const input = { type: 'task-updated', workspaceId: 'workspace', userId: 'user', timestamp: 1, data: { taskId: 'task', completed: false } }
  assert.equal(normalizeRealtimeEvent(input).data.taskId, 'task')
  assert.throws(() => normalizeRealtimeEvent({ ...input, data: [] }), /Realtime event is invalid/)
})

test('oversized constrained collections fail before inspecting their elements', () => {
  let reads = 0
  const value = [{ get title() { reads++; return 'title' } }, { title: 'another' }]
  const result = zod.z.array(zod.z.object({ title: zod.z.string() })).max(1).safeParse(value)
  assert.equal(result.success, false)
  assert.equal(reads, 0)
})
