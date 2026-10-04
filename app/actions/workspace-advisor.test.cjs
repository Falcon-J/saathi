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
  assert.match(source, /setIfAbsent/)
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
