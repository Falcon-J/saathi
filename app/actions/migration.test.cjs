const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

function load(sourcePath, dependencies) {
  const exports = {}
  const js = ts.transpileModule(readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'exports', js)(name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

function fixture() {
  const writes = []
  let session = { id: 'actor', email: 'member@example.test' }, allowed = true, enabled = true
  const actions = load(`${__dirname}/migration.ts`, {
    'node:crypto': require('node:crypto'),
    '@/lib/auth-simple': { getSession: async () => session },
    '@/lib/csv': load(`${__dirname}/../../lib/csv.ts`, {}),
    '@/lib/feature-flags': { resolveFeatureFlags: () => ({ csvImport: enabled }) },
    './workspaces': { getUserWorkspaces: async () => allowed ? [{ id: 'workspace' }] : [] },
    '@/app/tasks/actions': { addTask: async (...args) => {
      writes.push(args)
      if (args[1] === 'Unavailable') throw new Error('database password and private details')
      if (args[1] === 'Denied') return { error: 'Access denied', code: 'forbidden' }
      return { success: true, task: { id: `task-${writes.length}` } }
    } },
  })
  return { writes, run: actions.importTasksFromCsv, setSession: value => { session = value }, setAllowed: value => { allowed = value }, setEnabled: value => { enabled = value } }
}

test('CSV authorization, capability, byte and row limits reject before task writes', async () => {
  const f = fixture()
  f.setSession(null)
  assert.match((await f.run('workspace', 'title\nTask')).error, /Authentication/)
  f.setSession({ id: 'actor', email: 'member@example.test' })
  f.setEnabled(false)
  assert.match((await f.run('workspace', 'title\nTask')).error, /unavailable/)
  f.setEnabled(true)
  f.setAllowed(false)
  assert.match((await f.run('workspace', 'title\nTask')).error, /Access denied/)
  f.setAllowed(true)
  assert.match((await f.run('workspace', 'title\n' + 'é'.repeat(262145))).error, /512 KB/)
  assert.match((await f.run('workspace', 'title\n' + Array(101).fill('Task').join('\n'))).error, /100 tasks/)
  assert.equal(f.writes.length, 0)
})

test('CSV partial results preserve row errors and task metadata without leaking unexpected failures', async () => {
  const f = fixture()
  const result = await f.run('workspace', 'title,description,priority,duedate,dueat,estimatedminutes,assigneeemail\nGood,Context,high,2026-10-04,,45,member@example.test\nBad priority,,urgent,,,,\nDenied,,,,,,\nUnavailable,,,,,,')
  assert.equal(result.imported, 1)
  assert.equal(result.failed, 3)
  assert.deepEqual(result.errors, [
    { row: 3, message: 'Priority must be low, medium, or high' },
    { row: 4, message: 'Access denied' },
    { row: 5, message: 'Task could not be imported. Refresh the Board before retrying this row.' },
  ])
  assert.deepEqual(f.writes[0].slice(0, 9), ['workspace', 'Good', 'Context', '2026-10-04', 'member@example.test', 'high', undefined, 45, undefined])
  assert.equal(f.writes.length, 3)
})

test('retrying the same CSV uses the same row commands without merging identical rows', async () => {
  const f = fixture()
  await f.run('workspace', 'title\nSame\nSame')
  await f.run('workspace', 'title\nSame\nSame')
  assert.equal(typeof f.writes[0][9], 'string')
  assert.equal(f.writes[0][9], f.writes[2][9])
  assert.equal(f.writes[1][9], f.writes[3][9])
  assert.notEqual(f.writes[0][9], f.writes[1][9])
})
