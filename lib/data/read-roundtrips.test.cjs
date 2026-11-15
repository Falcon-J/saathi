const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

const workspace = '00000000-0000-4000-8000-000000000001'
const actor = '00000000-0000-4000-8000-000000000002'
const first = '00000000-0000-4000-8000-000000000003'
const second = '00000000-0000-4000-8000-000000000004'
function load(file, deps) {
  const exports = {}
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', js)(name => name in deps ? deps[name] : require(name), exports)
  return exports
}
function fixture(rows, { activeTransaction = false, deny = false } = {}) {
  const calls = [], accessChecks = [], transactions = []
  const db = async (strings, ...values) => { calls.push({ sql: strings.join('?'), values }); return typeof rows === 'function' ? rows(calls.length) : rows }
  db.begin = async (options, callback) => { assert.equal(options, "isolation level repeatable read read only"); transactions.push(options); return callback(db) }
  const deps = { '../../features/access/service.ts': { assertWorkspaceAccess: async (actorId, workspaceId, capability, tx) => { assert.equal(tx, db); accessChecks.push({ actorId, workspaceId, capability }); if (deny) throw Object.assign(Error('Access denied'), { code: 'forbidden' }) } }, '../db/client.ts': { getDb: () => db }, '../db/transaction-context.ts': { getCurrentTransaction: () => activeTransaction ? db : undefined }, './events.ts': {}, './command-receipts.ts': {} }
  const tasks = load('lib/data/tasks.ts', { ...deps,
    '../task-deadline.ts': {}, '../task-contract.ts': {}, '../task-permission.ts': {},
    '../task-page.ts': require('../task-page.ts'),
  })
  const graph = load('lib/data/task-dependencies.ts', { ...deps, './tasks.ts': tasks, '../task-permission.ts': {} })
  return { ...tasks, ...graph, calls, accessChecks, transactions }
}
const row = id => ({ id, workspace_id: workspace, title: id, status: 'in_progress', priority: 'high',
  created_at: '2026-10-04T00:00:00.123456+00:00', updated_at: '2026-10-04T00:00:00.123456+00:00',
  due_date: '2026-11-09', creator_email: 'owner@example.test', assignee_email: 'member@example.test', version: 2 })

test('unattached page uses one membership/attachment/data snapshot without a transaction and keeps its DTO/cursor', async () => {
  const ui = fixture([{ section_attached: false, authorized: true, cursor_valid: true, ...row(first) }, { section_attached: false, authorized: true, cursor_valid: true, ...row(second) }])
  const page = await ui.listTaskRecordsPage(actor, workspace, { limit: 1, search: ' NEEDLE ', status: 'active', priority: 'high', assigneeEmail: 'MEMBER@example.test' })
  assert.equal(ui.calls.length, 1)
  assert.deepEqual(ui.accessChecks, [])
  assert.deepEqual(ui.transactions, [])
  assert.equal(page.tasks.length, 1)
  assert.equal(page.tasks[0].status, 'in-progress')
  assert.equal(page.tasks[0].createdAt, '2026-10-04T00:00:00.123Z')
  assert.equal(page.tasks[0].dueDate, '2026-11-09')
  const cursor = JSON.parse(Buffer.from(page.nextCursor, 'base64url'))
  assert.equal(cursor.boundary, first)
  assert.equal(cursor.search, 'needle')
  assert.equal(cursor.assigneeEmail, 'member@example.test')
  for (const value of [actor, workspace, 'needle', 'active', 'high', 'member@example.test']) assert.ok(ui.calls[0].values.includes(value))
})

test('authorized empty page remains distinct from forbidden and an unavailable cursor', async () => {
  assert.deepEqual(await fixture([{ authorized: true, cursor_valid: true, id: null }]).listTaskRecordsPage(actor, workspace), { tasks: [], nextCursor: null })
  await assert.rejects(fixture([{ authorized: false, cursor_valid: false }]).listTaskRecordsPage(actor, workspace), { code: 'forbidden' })
  const { encodeTaskCursor, normalizeTaskPage } = require('../task-page.ts')
  const cursor = encodeTaskCursor(workspace, normalizeTaskPage(), first)
  await assert.rejects(fixture([{ authorized: true, cursor_valid: false }]).listTaskRecordsPage(actor, workspace, { cursor }), { code: 'validation' })
})

test('invalid cursor scope is rejected before querying', async () => {
  const ui = fixture([])
  const { encodeTaskCursor, normalizeTaskPage } = require('../task-page.ts')
  const cursor = encodeTaskCursor(workspace, normalizeTaskPage(), first)
  await assert.rejects(ui.listTaskRecordsPage(actor, workspace, { cursor, status: 'active' }), { code: 'validation' })
  assert.equal(ui.calls.length, 0)
})

test('unattached aggregates use one membership/attachment/data snapshot and preserve zero totals', async () => {
  const ui = fixture([{ section_attached: false, authorized: true, total: 0, open: 0, done: 0, overdue: 0, todo: 0, progress: 0, low: 0, medium: 0, high: 0 }])
  assert.deepEqual(await ui.getTaskAggregates(actor, workspace), { total: 0, open: 0, done: 0, overdue: 0, byStatus: { todo: 0, 'in-progress': 0, done: 0 }, byPriority: { low: 0, medium: 0, high: 0 } })
  assert.equal(ui.calls.length, 1)
  assert.deepEqual(ui.accessChecks, [])
  assert.deepEqual(ui.transactions, [])
  await assert.rejects(fixture([{ authorized: false }]).getTaskAggregates(actor, workspace), { code: 'forbidden' })
})

test('attached detection returns no task data before a fresh repeatable-read policy fallback', async () => {
  const ui = fixture(call => call === 1 ? [{ section_attached: true, authorized: false, cursor_valid: false, id: null }] : [{ section_attached: true, authorized: true, cursor_valid: true, ...row(first) }])
  assert.equal((await ui.listTaskRecordsPage(actor, workspace)).tasks[0].id, first)
  assert.equal(ui.calls.length, 2)
  assert.equal(ui.transactions.length, 1)
  assert.deepEqual(ui.accessChecks, [{ actorId: actor, workspaceId: workspace, capability: 'read' }])
  const revoked = fixture([{ section_attached: true, authorized: false, cursor_valid: false, id: null }], { deny: true })
  await assert.rejects(revoked.listTaskRecordsPage(actor, workspace), { code: 'forbidden' })
  assert.equal(revoked.calls.length, 1, 'policy denial stops before the data query')
})

test('active transaction reads retain the existing policy-checked nested transaction path', async () => {
  const ui = fixture([{ section_attached: false, authorized: true, cursor_valid: true, ...row(first) }], { activeTransaction: true })
  assert.equal((await ui.listTaskRecordsPage(actor, workspace)).tasks[0].id, first)
  assert.equal(ui.calls.length, 1)
  assert.equal(ui.transactions.length, 1)
  assert.equal(ui.accessChecks.length, 1)
})

test('nonmember denial precedes cursor disclosure and avoids policy fallback', async () => {
  const ui = fixture([{ section_attached: false, authorized: false, cursor_valid: false, id: null }])
  await assert.rejects(ui.listTaskRecordsPage(actor, workspace), { code: 'forbidden' })
  assert.equal(ui.calls.length, 1)
  assert.equal(ui.transactions.length, 0)
})

test('graph reads one data statement within the ACL snapshot and maps tasks, dependencies, timezone and clock', async () => {
  const ui = fixture([{ authorized: true, timezone: 'Pacific/Kiritimati', as_of: '2026-11-09T12:00:00+00:00',
    tasks: [row(first)], dependencies: [{ workspace_id: workspace, dependent_task_id: second, prerequisite_task_id: first }] }])
  const graph = await ui.readTaskGraph(actor, workspace)
  assert.equal(ui.calls.length, 1)
  assert.deepEqual(ui.accessChecks, [{ actorId: actor, workspaceId: workspace, capability: "read" }])
  assert.equal(graph.tasks[0].status, 'in-progress')
  assert.equal(graph.timezone, 'Pacific/Kiritimati')
  assert.equal(graph.asOf, '2026-11-09T12:00:00.000Z')
  assert.deepEqual(graph.dependencies, [{ workspaceId: workspace, dependentTaskId: second, prerequisiteTaskId: first }])
})

test('authorized empty graph succeeds and forbidden graph exposes no data', async () => {
  const ui = fixture([{ authorized: true, timezone: 'UTC', as_of: '2026-11-09T12:00:00Z', tasks: [], dependencies: [] }])
  assert.deepEqual((await ui.readTaskGraph(actor, workspace)).tasks, [])
  await assert.rejects(fixture([{ authorized: false }]).readTaskGraph(actor, workspace), { code: 'forbidden' })
})
