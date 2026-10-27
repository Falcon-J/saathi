const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')

function harness(overrides = {}) {
  class TaskError extends Error { constructor(message, code) { super(message); this.code = code } }
  class RateLimitExceeded extends Error {}
  const calls = []
  const dependencies = {
    '@/lib/auth-simple': { getVerifiedActor: async () => ({ id: 'member' }) },
    '@/lib/post-commit': { afterDomainCommit: workspaceId => calls.push(['delivery', workspaceId]) },
    '@/lib/data/tasks': { TaskError },
    '@/lib/data/task-dependencies': {
      readTaskGraph: async (...args) => { calls.push(['read', ...args]); return { tasks: [], dependencies: [], timezone: 'UTC', asOf: '2026-10-27T00:00:00Z' } },
      changeTaskPrerequisite: async (...args) => { calls.push(['write', ...args]); return { task: { workspaceId: 'workspace', version: 3 }, replayed: true } },
    },
    '@/lib/rate-limit': { consumeDistributedRateLimit: async () => {}, RateLimitExceeded },
    '@/lib/env': { getRateLimits: () => ({ tasks: { maxRequests: 10, windowMs: 1000 } }) },
    ...overrides,
  }
  const exports = {}
  const source = fs.readFileSync('app/actions/task-dependencies.ts', 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'exports', js)(name => dependencies[name], exports)
  return { ...exports, calls, TaskError }
}

test('dependency actions reject missing identity before reading or writing', async () => {
  const actions = harness({ '@/lib/auth-simple': { getVerifiedActor: async () => null } })
  assert.equal((await actions.getTaskGraph('workspace')).code, 'unauthenticated')
  assert.equal((await actions.addPrerequisite({})).code, 'unauthenticated')
  assert.deepEqual(actions.calls, [])
})

test('dependency actions use verified actor, immutable operation and post-commit delivery', async () => {
  const actions = harness()
  const input = { workspaceId: 'workspace', dependentTaskId: 'task', prerequisiteTaskId: 'before', expectedVersion: 1, commandId: 'command' }
  const result = await actions.addPrerequisite(input)
  assert.equal(result.success, true)
  assert.equal(result.task.version, 3)
  assert.equal(result.replayed, true)
  assert.deepEqual(actions.calls, [['write', 'member', { ...input, operation: 'add' }], ['delivery', 'workspace']])
  await actions.getTaskGraph('workspace')
  assert.deepEqual(actions.calls[2], ['read', 'member', 'workspace'])
})

test('provider and database internals are not exposed; uncertain writes remain retryable', async () => {
  const actions = harness({ '@/lib/data/task-dependencies': {
    readTaskGraph: async () => { throw new Error('private database connection') },
    changeTaskPrerequisite: async () => { throw new Error('private database connection') },
  } })
  const read = await actions.getTaskGraph('workspace')
  assert.equal(read.code, 'unavailable')
  assert.doesNotMatch(read.error, /private/)
  const write = await actions.removePrerequisite({})
  assert.equal(write.unknownOutcome, true)
  assert.doesNotMatch(write.error, /private/)
  assert.deepEqual(actions.calls, [])
})

test('a committed replay after task deletion confirms success without stored task data', async () => {
  const actions = harness({ '@/lib/data/task-dependencies': {
    changeTaskPrerequisite: async () => ({ replayed: true }),
  } })
  const result = await actions.addPrerequisite({ workspaceId: 'workspace' })
  assert.deepEqual(result, { success: true, replayed: true })
  assert.deepEqual(actions.calls, [['delivery', 'workspace']])
})
