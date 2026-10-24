const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

function fixture(overrides = {}) {
  const slots = []
  let cursor = 0, effects = [], realtimeOptions, result, workspaceReads = 0
  const same = (a,b) => a && b && a.length === b.length && a.every((value,i) => Object.is(value,b[i]))
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
    useCallback(callback, deps) { const i = cursor++; if (!same(slots[i]?.deps,deps)) slots[i] = { callback, deps }; return slots[i].callback },
    useEffect(effect, deps) { const i = cursor++; if (!same(slots[i]?.deps,deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = effect() }) } },
  }
  react.useLayoutEffect = react.useEffect
  const workspaces = [{ id: 'workspace' }, { id: 'other' }]
  const dependencies = {
    react,
    '@/app/tasks/actions': { getTasks: async () => ({ tasks: [] }), ...overrides },
    '@/app/actions/workspaces': { getUserWorkspaces: async () => { workspaceReads++; return workspaces }, ...overrides },
    '@/hooks/use-notifications': { useNotifications: () => ({ success() {}, error() {}, info() {} }) },
    '@/hooks/useRealtime': { useRealtime: options => { realtimeOptions = options; return {} } },
    '@/lib/identity': { normalizeEmail: value => value.toLowerCase() },
    '@/lib/mutation-result': { getMutationError: result => result?.error },
    '@/lib/read-coordinator': require('../lib/read-coordinator.ts'),
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('hooks/use-workspaces.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require','exports','console',js)(name => { assert.ok(name in dependencies,name); return dependencies[name] }, exports, { error() {} })
  return {
    render(email = 'owner@example.test', options) { cursor = 0; result = exports.useWorkspaces(email, options); const pending = effects; effects = []; pending.forEach(effect => effect()); return result },
    realtime: () => realtimeOptions,
    workspaceReads: () => workspaceReads,
  }
}

test('task event bursts coalesce without reloading the workspace list', async () => {
  const read = deferred()
  let tasksRead = 0, delay = false
  const ui = fixture({ getTasks: async () => { tasksRead++; return delay ? read.promise : { tasks: [] } } })
  ui.render(); await tick(); ui.render(); await tick(); ui.render()
  const before = tasksRead, workspacesBefore = ui.workspaceReads()
  delay = true
  for (let i = 0; i < 20; i++) ui.realtime().onTaskCreated({ workspaceId: 'workspace' })
  assert.equal(tasksRead, before + 1)
  read.resolve({ tasks: [{ id: 'new' }] }); await tick()
  assert.equal(tasksRead, before + 2)
  assert.equal(ui.workspaceReads(), workspacesBefore)
  assert.deepEqual(ui.render().tasks, [{ id: 'new' }])
})

test('a committed create invalidates older reads and retries a lost acknowledgement with the same command', async () => {
  const read = deferred()
  const commands = []
  let delay = false
  const ui = fixture({ getTasks: async () => delay ? read.promise : { tasks: [] }, addTask: async (...args) => {
    commands.push(args[9])
    if (commands.length === 1) throw new Error('Lost acknowledgement')
    return { success: true, task: { id: 'created' } }
  } })
  ui.render(); await tick(); ui.render(); await tick()
  let state = ui.render()
  delay = true
  const old = state.refreshTasks()
  await assert.rejects(state.addTask('Task'), /Lost acknowledgement/)
  await state.addTask('Task')
  read.resolve({ tasks: [] }); await old
  state = ui.render()
  assert.equal(commands.length, 2)
  assert.equal(commands[0], commands[1])
  assert.deepEqual(state.tasks, [{ id: 'created' }])
  assert.equal(state.tasksLoading, false)
})

test('late workspace creation cannot change a new account selection', async () => {
  const created = deferred()
  const ui = fixture({ createWorkspace: () => created.promise })
  ui.render(); await tick(); ui.render(); await tick()
  const pending = ui.render().createWorkspace('Old account')
  ui.render('other@example.test'); await tick(); ui.render('other@example.test'); await tick()
  created.resolve({ id: 'old-account-workspace' }); await pending
  const state = ui.render('other@example.test')
  assert.equal(state.currentWorkspaceId, 'workspace')
  assert.ok(!state.workspaces.some(workspace => workspace.id === 'old-account-workspace'))
})

test('lost create acknowledgement retains its command across workspace navigation', async () => {
  const commands = []
  const ui = fixture({ addTask: async (...args) => { commands.push(args[9]); throw new Error('Lost acknowledgement') } })
  ui.render(); await tick(); ui.render(); await tick()
  await assert.rejects(ui.render().addTask('Task'))
  ui.render().setCurrentWorkspaceId('other'); ui.render(); await tick()
  ui.render().setCurrentWorkspaceId('workspace'); ui.render(); await tick()
  await assert.rejects(ui.render().addTask('Task'))
  assert.equal(commands.length, 2)
  assert.equal(commands[0], commands[1])
})

test('explicit refresh reports failures and confirms successful reads', async () => {
  let failing = false
  const ui = fixture({ getTasks: async () => failing ? { error: 'Offline' } : { tasks: [] } })
  ui.render(); await tick(); ui.render(); await tick()
  assert.equal(await ui.render().refreshTasks(), true)
  failing = true
  assert.equal(await ui.render().refreshTasks(), false)
  assert.equal(ui.render().taskError, 'Offline')
})

test('Board mode does not fetch complete task collections, including realtime resync', async () => {
  let reads = 0
  const ui = fixture({getTasks: async () => {reads++; return {tasks: []}}})
  ui.render('owner@example.test', {loadTasks:false}); await tick(); ui.render('owner@example.test', {loadTasks:false}); await tick()
  ui.realtime().onTaskCreated({workspaceId:'workspace'}); await tick()
  assert.equal(reads,0)
  ui.render('owner@example.test', {loadTasks:true}); await tick()
  assert.equal(reads,1)
})
