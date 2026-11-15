const assert = require('node:assert/strict')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')
function load(path, dependencies) {
  const exports = {}
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', js)(name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name] }, exports)
  return exports
}
async function fixture() {
  const { BrowserWorkspaceError, browserWorkspaceFailure } = await import('./browser-workspace.ts')
  let session = { id: 'server-actor', email: 'actor@example.test' }, enabled = true, replay = false, failure
  const workspace = { id: 'workspace', name: 'Goal' }, calls = [], deliveries = []
  const dependencies = {
    '@/lib/auth-simple': { getSession: async () => session },
    '@/lib/post-commit': { afterDomainCommit: id => { deliveries.push(id); throw new Error('scheduling failed') } },
    '@/lib/identity': {}, '@/lib/invitation-domain': {}, '@/lib/data/workspaces': {},
    '@/lib/feature-flags': { isAiWorkspaceEnabled: () => enabled },
    '@/lib/groq-chat': {},
    '@/lib/workspace-intent': await import('../../lib/workspace-intent.ts'),
    '@/lib/rate-limit': { consumeDistributedRateLimit: async () => {} },
    '@/features/platform/browser-workspace': { BrowserWorkspaceError, browserWorkspaceFailure,
      createBrowserWorkspace: async (actor, input, commandId, options) => {
        if (failure) throw failure
        if (!replay) await options?.beforeCreate?.()
        calls.push({ actor, input, commandId }); return workspace
      } },
  }
  return { manual: load('app/actions/workspaces.ts', dependencies), plan: load('app/actions/workspace-intent.ts', dependencies), calls, deliveries,
    setSession: value => { session = value }, disable: () => { enabled = false }, replay: () => { replay = true }, fail: error => { failure = error } }
}
const plan = { title: 'Goal', summary: 'Reviewed goal', targetDate: null, tasks: [{ title: 'First', bucket: 'today', dueDate: null, estimatedMinutes: null }] }
test('manual server action binds server session identity and keeps confirmed result when postcommit scheduling fails', async () => {
  const f = await fixture()
  assert.deepEqual(await f.manual.createWorkspaceCommand('Goal', { summary: 'Reviewed' }, 'browser-command', 'server-actor'), { workspace: { id: 'workspace', name: 'Goal' } })
  assert.equal(f.calls[0].actor, 'server-actor')
  assert.equal(f.calls[0].commandId, 'browser-command')
  assert.deepEqual(f.deliveries, ['workspace'])
  f.setSession(null)
  const expired = await f.manual.createWorkspaceCommand('Goal', undefined, 'browser-command', 'server-actor')
  assert.equal(expired.unknownOutcome, true)
  assert.match(expired.error, /sign in.*same/i)
  assert.equal(f.calls.length, 1)
})
test('missing session preserves an uncertain reviewed creation until same-command recovery after sign-in', async () => {
  const f = await fixture()
  f.setSession(null)
  const expired = await f.plan.createWorkspaceFromPlan(plan, 'browser-command', 'server-actor')
  assert.equal(expired.unknownOutcome, true)
  assert.match(expired.error, /sign in.*same/i)
  assert.equal(f.calls.length, 0)
})
test('reviewed plan can recover existing command after AI is disabled; new disabled requests are known rejected', async () => {
  const f = await fixture()
  f.disable()
  const denied = await f.plan.createWorkspaceFromPlan(plan, 'browser-command', 'server-actor')
  assert.equal(denied.unknownOutcome, false)
  assert.match(denied.error, /unavailable/)
  assert.equal(f.calls.length, 0)
  f.replay()
  const result = await f.plan.createWorkspaceFromPlan(plan, 'browser-command', 'server-actor')
  assert.equal(result.workspace.id, 'workspace')
  assert.equal(f.calls[0].actor, 'server-actor')
  assert.deepEqual(f.calls[0].input.tasks, [{ title: 'First', bucket: 'today', dueDate: undefined, estimatedMinutes: undefined }])
})
test('actions distinguish known rejection from ambiguous failure without exposing internals', async () => {
  const f = await fixture()
  const { BrowserWorkspaceError } = await import('./browser-workspace.ts')
  f.fail(new BrowserWorkspaceError('Workspace unavailable or access denied.', 'forbidden'))
  assert.equal((await f.manual.createWorkspaceCommand('Goal', undefined, 'key', 'server-actor')).unknownOutcome, false)
  f.fail(new Error('private database password'))
  const result = await f.plan.createWorkspaceFromPlan(plan, 'key', 'server-actor')
  assert.equal(result.unknownOutcome, true)
  assert.doesNotMatch(result.error, /password/)
})

for (const expectedActor of ['previous-account', undefined, '']) {
  test(`stale or missing expected actor (${String(expectedActor)}) cannot create under the current cookie identity`, async () => {
    const f = await fixture()
    const manual = await f.manual.createWorkspaceCommand('Goal', undefined, 'browser-command', expectedActor)
    const reviewed = await f.plan.createWorkspaceFromPlan(plan, 'browser-command', expectedActor)
    for (const result of [manual, reviewed]) {
      assert.equal(result.workspace, undefined)
      assert.equal(result.unknownOutcome, true)
      assert.match(result.error, /account.*same workspace creation/i)
    }
    assert.equal(f.calls.length, 0)
    assert.equal(f.deliveries.length, 0)
  })
}
