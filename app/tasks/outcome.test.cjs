const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')

function loadAction(file, dependencies) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const exports = {}
  new Function('require', 'exports', 'console', js)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  }, exports, { warn() {} })
  return exports
}
class TaskError extends Error { constructor(message, code = 'unavailable') { super(message); this.code = code } }
class RateLimitExceeded extends Error {}
const task = { id: 'task', workspaceId: 'workspace' }
const dependencies = {
  '@/lib/auth-simple': { getSession: async () => ({ id: 'actor' }) },
  '@/lib/post-commit': { afterDomainCommit() {} },
  'next/cache': { revalidatePath() { throw new Error('Cache unavailable') } },
  '@/lib/data/tasks': { TaskError, createTaskRecord: async () => task, changeTaskRecord: async () => task },
  '@/lib/rate-limit': { RateLimitExceeded, consumeDistributedRateLimit: async () => {} },
  '@/lib/env': { getRateLimits: () => ({ tasks: { maxRequests: 100, windowMs: 1000 } }) },
}
for (const name of ['addTask', 'updateTask', 'toggleTask', 'deleteTask']) {
  test(`${name} stays successful when cache invalidation fails after commit`, async () => {
    const actions = loadAction('app/tasks/actions.ts', dependencies)
    const result = await actions[name]('workspace', name === 'updateTask' ? { title: 'Task' } : 'Task')
    assert.equal(result.success, true)
    assert.equal(result.error, undefined)
  })
}
test('unexpected write failure reports unknown outcome rather than a safe retry', async () => {
  const actions = loadAction('app/tasks/actions.ts', { ...dependencies, '@/lib/data/tasks': {
    ...dependencies['@/lib/data/tasks'], createTaskRecord: async () => { throw new Error('Lost database acknowledgement') },
  } })
  const result = await actions.addTask('workspace', 'Task')
  assert.equal(result.unknownOutcome, true)
})
test('comment stays successful when cache invalidation fails after commit', async () => {
  const actions = loadAction('app/actions/comments.ts', { ...dependencies,
    '@/lib/data/comments': { createTaskComment: async () => ({ id: 'comment' }) },
  })
  assert.equal((await actions.addTaskComment('task', 'Hello')).success, true)
})
