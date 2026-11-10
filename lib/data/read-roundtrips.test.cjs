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
function fixture(rows) {
  const calls = []
  const db = async (strings, ...values) => { calls.push({ sql: strings.join('?'), values }); return rows }
  db.begin = () => assert.fail('A snapshot read must use one statement without transaction round trips')
  const deps = { '../db/client.ts': { getDb: () => db }, './events.ts': {}, './command-receipts.ts': {} }
  const tasks = load('lib/data/tasks.ts', { ...deps,
    '../task-deadline.ts': {}, '../task-contract.ts': {}, '../task-permission.ts': {},
    '../task-page.ts': require('../task-page.ts'),
  })
  const graph = load('lib/data/task-dependencies.ts', { ...deps, './tasks.ts': tasks, '../task-permission.ts': {} })
  return { ...tasks, ...graph, calls }
}
const row = id => ({ id, workspace_id: workspace, title: id, status: 'in_progress', priority: 'high',
  created_at: '2026-10-04T00:00:00.123456+00:00', updated_at: '2026-10-04T00:00:00.123456+00:00',
  due_date: '2026-11-09', creator_email: 'owner@example.test', assignee_email: 'member@example.test', version: 2 })

test('page uses one statement, maps DTOs and emits a scoped lookahead cursor', async () => {
  const ui = fixture([{ authorized: true, cursor_valid: true, ...row(first) }, { authorized: true, cursor_valid: true, ...row(second) }])
  const page = await ui.listTaskRecordsPage(actor, workspace, { limit: 1, search: ' NEEDLE ', status: 'active', priority: 'high', assigneeEmail: 'MEMBER@example.test' })
  assert.equal(ui.calls.length, 1)
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

test('aggregates use one statement and keep zero totals distinct from forbidden', async () => {
  const ui = fixture([{ authorized: true, total: 0, open: 0, done: 0, overdue: 0, todo: 0, progress: 0, low: 0, medium: 0, high: 0 }])
  assert.deepEqual(await ui.getTaskAggregates(actor, workspace), { total: 0, open: 0, done: 0, overdue: 0, byStatus: { todo: 0, 'in-progress': 0, done: 0 }, byPriority: { low: 0, medium: 0, high: 0 } })
  assert.equal(ui.calls.length, 1)
  await assert.rejects(fixture([{ authorized: false }]).getTaskAggregates(actor, workspace), { code: 'forbidden' })
})

test('graph reads one snapshot statement and maps tasks, dependencies, timezone and clock', async () => {
  const ui = fixture([{ authorized: true, timezone: 'Pacific/Kiritimati', as_of: '2026-11-09T12:00:00+00:00',
    tasks: [row(first)], dependencies: [{ workspace_id: workspace, dependent_task_id: second, prerequisite_task_id: first }] }])
  const graph = await ui.readTaskGraph(actor, workspace)
  assert.equal(ui.calls.length, 1)
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
