const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')

test('refresh for an old workspace cannot change loading or issue a read', async () => {
  const source = fs.readFileSync('hooks/use-workspaces.ts', 'utf8')
  const ast = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true)
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'refreshTasksForWorkspace') callback = node.initializer.arguments[0].getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const js = ts.transpileModule(`const refresh = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  let loadingCalls = 0, reads = 0
  const deps = { loadTasksRef: { current: true }, taskReadVersion: { current: 0 }, selectionRef: { current: { workspaceId: 'new-workspace', userEmail: 'member@example.test' } }, setTasksLoading: () => loadingCalls++, getTasks: async () => { reads++; return { tasks: [] } }, setTaskError() {}, updateTasks() {}, console: { error() {} } }
  const refresh = new Function(...Object.keys(deps), `${js}; return refresh`)(...Object.values(deps))
  assert.equal(await refresh('old-workspace'), null)
  assert.equal(reads, 0)
  assert.equal(loadingCalls, 0)
})

test('an older task refresh cannot overwrite the latest completed refresh', async () => {
  const source = fs.readFileSync('hooks/use-workspaces.ts', 'utf8')
  const ast = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true)
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'refreshTasksForWorkspace') callback = node.initializer.arguments[0].getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const js = ts.transpileModule(`const refresh = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  let finishOld, reads = 0, tasks = []
  const deps = { loadTasksRef: { current: true }, taskReadVersion: { current: 0 }, selectionRef: { current: { workspaceId: 'workspace' } }, setTasksLoading() {},
    getTasks: async () => ++reads === 1 ? new Promise(resolve => { finishOld = resolve }) : { tasks: [{ id: 'new' }] },
    setTaskError() {}, updateTasks: update => { tasks = update(tasks) }, console: { error() {} } }
  const refresh = new Function(...Object.keys(deps), `${js}; return refresh`)(...Object.values(deps))
  const old = refresh('workspace')
  await refresh('workspace')
  finishOld({ tasks: [{ id: 'old' }] })
  await old
  assert.deepEqual(tasks, [{ id: 'new' }])
})

for (const name of ['handleToggleTask', 'handleDeleteTask', 'handleEditTask', 'handleAssignTask']) {
  for (const transport of [false, true]) test(`${name} reconciles once and restores prior view on ${transport ? 'transport' : 'command'} failure`, async () => {
    const source = fs.readFileSync('hooks/use-workspaces.ts', 'utf8')
    const ast = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true)
    let callback
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) callback = node.initializer.arguments[0].getText(ast)
      ts.forEachChild(node, visit)
    }
    visit(ast)
    const js = ts.transpileModule(`const command = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
    const original = { id: 'task', version: 2, title: 'Original', status: 'todo', completed: false, assigneeEmail: 'old@example.test', createdAt: '2026-10-04T00:00:00Z' }
    let tasks = [original], reads = 0
    const pending = { current: new Set() }
    const fail = async () => { if (transport) throw new Error('Request failed'); return { error: 'Command rejected' } }
    const deps = { currentWorkspaceId: 'workspace', tasksRef: { current: tasks }, pendingTaskIdsRef: pending,
      updateTasks: update => { tasks = update(tasks) }, updateTask: fail, toggleTask: fail, deleteTask: fail,
      refreshTasksForWorkspace: async () => { reads++; return null }, selectionRef: { current: { workspaceId: 'workspace' } }, console: { error() {} } }
    const command = new Function(...Object.keys(deps), `${js}; return command`)(...Object.values(deps))
    await assert.rejects(command('task', name === 'handleAssignTask' ? 'new@example.test' : { title: 'Changed' }))
    assert.equal(reads, 1)
    assert.deepEqual(tasks, [original])
    assert.equal(pending.current.size, 0)
  })
}

test('open editor version reaches update even after realtime replaces the task', async () => {
  const source = fs.readFileSync('hooks/use-workspaces.ts', 'utf8')
  const ast = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true)
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleEditTask') callback = node.initializer.arguments[0].getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(callback)
  const js = ts.transpileModule(`const edit = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  let receivedVersion
  const currentTask = { id: 'task', version: 2, title: 'New owner value' }
  const edit = new Function('currentWorkspaceId', 'tasksRef', 'pendingTaskIdsRef', 'updateTasks', 'updateTask', 'refreshTasksForWorkspace', 'selectionRef', `${js}; return edit`)(
    'workspace', { current: [currentTask] }, { current: new Set() }, () => {},
    async (id, updates, version) => { receivedVersion = version; return { task: currentTask } }, async () => [], { current: { workspaceId: 'workspace' } },
  )
  await edit('task', { title: 'Stale draft' }, 1)
  assert.equal(receivedVersion, 1)
  await edit('task', { title: 'Inline current edit' })
  assert.equal(receivedVersion, 2)
})

test('late edit failure cannot restore a task into a new selection of the same workspace', async () => {
  const source = fs.readFileSync('hooks/use-workspaces.ts', 'utf8')
  const ast = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true)
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleEditTask') callback = node.initializer.arguments[0].getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const js = ts.transpileModule(`const edit = ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const oldTask = { id: 'task', title: 'Old user view', version: 1 }
  const latestTask = { id: 'task', title: 'New user view', version: 3 }
  let tasks = [oldTask]
  const selectionRef = { current: { workspaceId: 'workspace', userEmail: 'old@example.test' } }
  const deps = { currentWorkspaceId: 'workspace', tasksRef: { current: tasks }, pendingTaskIdsRef: { current: new Set() }, updateTasks: update => { tasks = update(tasks) }, updateTask: async () => {
    selectionRef.current = { workspaceId: 'workspace', userEmail: 'new@example.test' }
    tasks = [latestTask]
    throw new Error('Late failure')
  }, refreshTasksForWorkspace: async () => null, selectionRef, console: { error() {} } }
  const edit = new Function(...Object.keys(deps), `${js}; return edit`)(...Object.values(deps))
  await assert.rejects(edit('task', { title: 'Old draft' }))
  assert.deepEqual(tasks, [latestTask])
})
