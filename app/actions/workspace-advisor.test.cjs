const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")
const ts = require("typescript")

test('confirming an existing AI draft schedules delivery after durable creation', async () => {
  const order = []
  const task = { id: 'task', workspaceId: 'workspace' }
  const dependencies = {
    '@/lib/auth-simple': { getSession: async () => ({ id: 'actor' }) },
    '@/lib/feature-flags': { isAiWorkspaceEnabled: () => true },
    '@/lib/data/tasks': { createTaskRecord: async () => { order.push('commit'); return task } },
    '@/lib/ai/workspace-advisor': { advisorTaskDraftSchema: { safeParse: data => ({ success: true, data }) } },
    '@/app/tasks/contract': { normalizeTaskUpdates: updates => ({ updates }) },
    '@/lib/redis': { redis: { get: async () => null, setIfAbsent: async () => true, set: async () => {} } },
    '@/lib/post-commit': { afterDomainCommit: workspaceId => { assert.equal(workspaceId, 'workspace'); order.push('delivery') } },
    zod: require('zod'),
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('app/actions/workspace-advisor.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require','exports',js)(name => dependencies[name] ?? {}, exports)
  const result = await exports.confirmWorkspaceAdvisorDraft('workspace', { title: 'Reviewed', priority: 'medium' }, 'a4e39e6a-98e7-462c-9c2f-42c4dd434edf')
  assert.deepEqual(result, { task })
  assert.deepEqual(order, ['commit', 'delivery'])
})

test('confirmation retries always reach authoritative authorization instead of cached task snapshots', async () => {
  for (const denial of ['Membership revoked', 'Workspace archived']) {
    let authorizedCalls = 0, deliveries = 0
    const dependencies = {
      '@/lib/auth-simple': { getSession: async () => ({ id: 'actor' }) },
      '@/lib/feature-flags': { isAiWorkspaceEnabled: () => true },
      '@/lib/data/tasks': { createTaskRecord: async (actor, workspace, _draft, key) => { authorizedCalls++; assert.equal(actor, 'actor'); assert.equal(workspace, 'workspace'); assert.match(key, /^[a-f0-9-]{36}$/); throw new Error(denial) } },
      '@/lib/ai/workspace-advisor': { advisorTaskDraftSchema: { safeParse: data => ({ success: true, data }) } },
      '@/app/tasks/contract': { normalizeTaskUpdates: updates => ({ updates }) },
      '@/lib/redis': { redis: { get: async () => ({ status: 'complete', task: { id: 'private-task' } }) } },
      '@/lib/post-commit': { afterDomainCommit: () => { deliveries++ } },
      zod: require('zod'),
    }
    const exports = {}
    const js = ts.transpileModule(fs.readFileSync('app/actions/workspace-advisor.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    new Function('require', 'exports', js)(name => dependencies[name] ?? {}, exports)
    const result = await exports.confirmWorkspaceAdvisorDraft('workspace', { title: 'Reviewed', priority: 'medium' }, 'a4e39e6a-98e7-462c-9c2f-42c4dd434edf')
    assert.equal(result.task, undefined)
    assert.ok(result.error)
    assert.equal(authorizedCalls, 1)
    assert.equal(deliveries, 0)
  }
})
const { resolveFeatureFlags } = (() => {
  const exports = {}
  new Function("exports", ts.transpileModule(fs.readFileSync("lib/feature-flags.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports)
  return exports
})()

const source = fs.readFileSync("app/actions/workspace-advisor.ts", "utf8")

test("workspace advisor stays inside the authenticated, reviewable boundary", () => {
  assert.match(source, /"use server"/)
  assert.match(source, /getSession/)
  assert.match(source, /readWorkspace/)
  assert.match(source, /listTaskRecords/)
  assert.match(source, /buildAdvisorProjection/)
  assert.match(source, /consumeDistributedRateLimit/)
  assert.match(source, /recordAiOperation/)
  assert.match(source, /isAiWorkspaceEnabled/)
  assert.match(source, /confirmWorkspaceAdvisorDraft/)
  assert.match(source, /createTaskRecord/)
  assert.doesNotMatch(source, /setIfAbsent|ai-draft-confirmation/)
  assert.match(source, /normalizeTaskUpdates/)
  assert.doesNotMatch(source, /autoCreate|applyNaturalLanguageCommand/)
})

test("disabled capabilities reject direct actions before provider calls or writes", async () => {
  let effects = 0
  const capabilities = resolveFeatureFlags({ ENABLE_AI_WORKSPACE: "false", ENABLE_CSV_IMPORT: "false" })
  const loadAction = (path) => {
    const exports = {}
    const dependencies = {
      "@/lib/auth-simple": { getSession: async () => ({ id: "actor", email: "actor@example.test" }) },
      "@/lib/feature-flags": { isAiWorkspaceEnabled: () => capabilities.aiWorkspace, resolveFeatureFlags: () => capabilities },
      "@/lib/data/workspaces": { readWorkspace: async () => ({ name: "Workspace" }), createWorkspaceRecord: async () => { effects++; throw new Error("Unexpected write") } },
      "@/lib/data/tasks": { listTaskRecords: async () => [], createTaskRecord: async () => { effects++; throw new Error("Unexpected write") } },
      "@/lib/ai/workspace-advisor": { buildAdvisorProjection: () => ({}) },
      "@/lib/data/ai-operations": { recordAiOperation: async () => {}, AiOperationError: Error },
      "@/lib/groq-chat": { requestGroqStructuredResponse: async () => { effects++; throw new Error("Unexpected provider call") } },
      "@/app/tasks/actions": { addTask: async () => { effects++; throw new Error("Unexpected write") } },
      zod: require("zod"),
    }
    const js = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    new Function("require", "exports", js)((name) => dependencies[name] ?? {}, exports)
    return exports
  }
  const intent = loadAction("app/actions/workspace-intent.ts")
  const advisor = loadAction("app/actions/workspace-advisor.ts")
  const csv = loadAction("app/actions/migration.ts")
  assert.match((await intent.generateWorkspaceDraft("Goal")).error, /unavailable/)
  assert.match((await intent.createWorkspaceFromPlan({})).error, /unavailable/)
  assert.match((await advisor.askWorkspaceAdvisor("workspace", "draft_task", "Task")).error, /unavailable/)
  assert.match((await advisor.confirmWorkspaceAdvisorDraft("workspace", {}, "key")).error, /unavailable/)
  assert.match((await csv.importTasksFromCsv("workspace", "title\nTask")).error, /unavailable/)
  assert.equal(effects, 0)
})

for (const scenario of [
  { name: 'mismatched capability', capability: 'summarize_workspace', response: { capability: 'identify_attention', attention: [] }, outcome: 'invalid_response' },
  { name: 'unauthorized attention reference', capability: 'identify_attention', response: { capability: 'identify_attention', attention: [{ taskId: 'other-workspace-task', reason: 'Review' }] }, outcome: 'invalid_response' },
  { name: 'duplicate attention reference', capability: 'identify_attention', response: { capability: 'identify_attention', attention: [{ taskId: 'task-1', reason: 'Review' }, { taskId: ' task-1 ', reason: 'Review again' }] }, outcome: 'invalid_response' },
  { name: 'provider transport failure', capability: 'identify_attention', outcome: 'provider_unavailable' },
]) {
  test(`askWorkspaceAdvisor records ${scenario.name} as ${scenario.outcome}`, async () => {
    const load = (path, dependencies) => {
      const exports = {}
      const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
      new Function('require', 'exports', js)(name => {
        assert.ok(name in dependencies, `Unexpected dependency ${name}`)
        return dependencies[name]
      }, exports)
      return exports
    }
    const model = load('lib/ai/workspace-advisor.ts', { zod: require('zod') })
    const service = load('lib/ai/workspace-advisor-service.ts', {
      zod: require('zod'), './workspace-advisor.ts': model,
      '../groq-chat.ts': { requestGroqStructuredResponse: async ({ parse }) => {
        if (!scenario.response) throw new Error('Provider transport unavailable')
        return parse({ ...scenario.response, answer: 'Review supplied tasks', draft: null })
      } },
    })
    const recorded = []
    const action = load('app/actions/workspace-advisor.ts', {
      '@/lib/auth-simple': { getSession: async () => ({ id: 'actor' }) },
      '@/lib/feature-flags': { isAiWorkspaceEnabled: () => true },
      '@/lib/rate-limit': { consumeDistributedRateLimit: async () => {}, RateLimitExceeded: class extends Error {} },
      '@/lib/data/workspaces': { readWorkspace: async () => ({ name: 'Workspace' }) },
      '@/lib/data/tasks': { listTaskRecords: async () => [{ id: 'task-1', title: 'Authorized task', priority: 'medium', status: 'todo' }] },
      '@/lib/post-commit': {},
      '@/lib/data/ai-operations': { recordAiOperation: async (...args) => recorded.push(args), AiOperationError: class extends Error {} },
      '@/lib/ai/workspace-advisor': model,
      '@/lib/ai/workspace-advisor-service': service,
      '@/app/tasks/contract': {},
      zod: require('zod'),
    })
    const result = await action.askWorkspaceAdvisor('workspace', scenario.capability, 'Review the supplied tasks')
    assert.match(result.error, /temporarily unavailable/)
    assert.equal(result.response, undefined)
    assert.equal(recorded.length, 1)
    assert.deepEqual(recorded[0].slice(0, 2), ['actor', 'workspace'])
    assert.equal(recorded[0][2].outcome, scenario.outcome)
    assert.equal(recorded[0][2].capability, scenario.capability)
  })
}
