const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

const task = (id, extra = {}) => ({ id, workspaceId: 'workspace', title: id, status: 'todo', completed: false, createdBy: 'owner@test.com', version: 1, ...extra })
const graph = { success: true, tasks: [task('API', { completed: true, status: 'done' }), task('Frontend')], dependencies: [{ workspaceId: 'workspace', dependentTaskId: 'Frontend', prerequisiteTaskId: 'API' }], timezone: 'UTC', asOf: '2026-10-27T10:00:00Z' }
const tick = () => new Promise(resolve => setImmediate(resolve))

function harness(options = {}) {
  const slots = [], effects = []
  const storage = options.storage ?? new Map()
  const browser = { sessionStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (options.storageFails) throw new Error('Storage denied'); storage.set(key, value) }, removeItem: key => storage.delete(key) } }
  let cursor = 0, tree, props = { workspace: { id: 'workspace', ownerId: 'owner@test.com', timezone: 'UTC' }, currentUserEmail: 'owner@test.com', refreshSignal: 0, onOpenTask: id => opened.push(id) }
  const opened = [], calls = []
  const jsx = (type, props) => ({ type, props })
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, index) => value !== b[index])
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, fn }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn() }) } },
  }
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' },
    '@/lib/identity': { normalizeEmail: value => value?.trim().toLowerCase() ?? '' },
    '@/lib/task-time': { formatTaskDue: () => '' },
    '@/lib/next-work': { deriveNextWork(tasks, dependencies) {
      const items = tasks.map(t => ({ task: t, readiness: t.completed ? 'completed_inconsistent' : 'ready', unassigned: !t.assigneeEmail, prerequisites: dependencies.filter(d => d.dependentTaskId === t.id).map(d => ({ taskId: d.prerequisiteTaskId, title: d.prerequisiteTaskId, status: tasks.find(t => t.id === d.prerequisiteTaskId).status })) }))
      return { ready: items.filter(i => !i.task.completed), waiting: [], completedInconsistencies: [] }
    } },
    '@/app/actions/task-dependencies': {
      getTaskGraph: options.read ?? (async () => graph),
      addPrerequisite: async input => { calls.push(['add', input]); return options.mutate ? options.mutate(input) : { success: true, task: task('Frontend', { version: 2 }) } },
      removePrerequisite: async input => { calls.push(['remove', input]); return options.mutate ? options.mutate(input) : { success: true, task: task('Frontend', { version: 2 }) } },
    },
  }
  const exports = {}
  new Function('require', 'exports', 'window', ts.transpileModule(fs.readFileSync('components/next-work-view.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, browser)
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  return {
    render(overrides = {}) { props = { ...props, ...overrides }; cursor = 0; tree = exports.NextWorkView(props); const rows = nodes(tree); effects.splice(0).forEach(fn => fn()); return rows },
    button(label) { return nodes(tree).find(node => node.type === 'Button' && (node.props['aria-label'] === label || JSON.stringify(node.props.children).includes(label))) },
    field(label) { return nodes(tree).find(node => node.props?.['aria-label'] === label) },
    text() { return JSON.stringify(tree) }, opened, calls, storage,
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

test('Next work loads authorized graph, shows evidence and opens canonical tasks', async () => {
  const ui = harness()
  ui.render(); assert.match(ui.text(), /Loading next work/)
  await tick(); ui.render()
  assert.match(ui.text(), /Unassigned/)
  assert.match(ui.text(), /Complete/)
  ui.button('Open Frontend').props.onClick()
  assert.deepEqual(ui.opened, ['Frontend'])
})

test('Next work failure clears prior graph and never reports empty readiness', async () => {
  let fail = false
  const ui = harness({ read: async () => fail ? { error: 'Access denied', code: 'forbidden' } : graph })
  ui.render(); await tick(); ui.render(); fail = true
  ui.render({ refreshSignal: 1 }); await tick(); ui.render()
  assert.match(ui.text(), /Access denied/)
  assert.doesNotMatch(ui.text(), /Frontend|Nothing needs attention/)
})

test('older graph responses cannot overwrite a later denied read', async () => {
  let finish, reads = 0
  const ui = harness({ read: async () => ++reads === 1 ? new Promise(resolve => { finish = resolve }) : { error: 'Access denied', code: 'forbidden' } })
  ui.render(); ui.render({ refreshSignal: 1 }); await tick(); ui.render()
  finish(graph); await tick(); ui.render()
  assert.match(ui.text(), /Access denied/)
  assert.doesNotMatch(ui.text(), /Frontend/)
})

test('a denied mutation invalidates an older in-flight graph response', async () => {
  let finishRead, finishWrite, reads = 0
  const ui = harness({
    read: async () => ++reads === 1 ? graph : new Promise(resolve => { finishRead = resolve }),
    mutate: async () => new Promise(resolve => { finishWrite = resolve }),
  })
  ui.render(); await tick(); ui.render()
  ui.button('Edit prerequisites for Frontend').props.onClick(); ui.render()
  ui.button('Remove API prerequisite').props.onClick()
  ui.render({ refreshSignal: 1 })
  finishWrite({ error: 'Access denied', code: 'forbidden' }); await tick(); ui.render()
  finishRead(graph); await tick(); ui.render()
  assert.match(ui.text(), /Access denied/)
  assert.doesNotMatch(ui.text(), /Frontend|API/)
})

test('only dependent owner or creator can edit prerequisites', async () => {
  const ui = harness()
  ui.render({ currentUserEmail: 'member@test.com' }); await tick(); ui.render()
  assert.equal(ui.button('Edit prerequisites for Frontend'), undefined)
  ui.render({ currentUserEmail: 'OWNER@test.com' }); await tick(); ui.render()
  assert.ok(ui.button('Edit prerequisites for Frontend'))
})

test('uncertain dependency changes retain exact command until recovered and reject duplicates', async () => {
  let attempts = 0, finish
  const ui = harness({ mutate: async () => ++attempts === 1 ? new Promise(resolve => { finish = resolve }) : { success: true, task: task('Frontend', { version: 2 }), replayed: true } })
  ui.render(); await tick(); ui.render()
  ui.button('Edit prerequisites for Frontend').props.onClick(); ui.render()
  const remove = ui.button('Remove API prerequisite').props.onClick
  remove(); remove(); ui.render()
  assert.equal(ui.calls.length, 1)
  finish({ error: 'Retry same change', code: 'unavailable', unknownOutcome: true }); await tick(); ui.render()
  assert.match(ui.text(), /Retry same change/)
  assert.equal(ui.button('Close prerequisites').props.disabled, true)
  assert.equal(ui.button('Open Frontend').props.disabled, true)
  ui.button('Open Frontend').props.onClick()
  assert.deepEqual(ui.opened, [])
  await ui.button('Retry change').props.onClick(); await tick(); ui.render()
  assert.equal(ui.calls.length, 2)
  assert.deepEqual(ui.calls[0][1], ui.calls[1][1])
  assert.equal(ui.button('Retry change'), undefined)
})

test('a committed change refreshes parent task versions and reports follow-up failures as saved', async () => {
  const ui = harness()
  let refreshes = 0
  ui.render({ onChanged: async () => { refreshes++; throw new Error('Offline') } }); await tick(); ui.render()
  ui.button('Edit prerequisites for Frontend').props.onClick(); ui.render()
  ui.button('Remove API prerequisite').props.onClick(); await tick(); ui.render()
  assert.equal(refreshes, 1)
  assert.match(ui.text(), /change saved/)
  assert.equal(ui.button('Retry change'), undefined)
})

test('a stale dependency edit retains its draft and refreshes the expected version', async () => {
  let reads = 0
  const ui = harness({
    read: async () => ({ ...graph, dependencies: [], tasks: graph.tasks.map(task => ({ ...task, version: ++reads > 2 ? 2 : 1 })) }),
    mutate: async () => ({ error: 'Task changed. Review and retry.', code: 'conflict' }),
  })
  ui.render(); await tick(); ui.render()
  ui.button('Edit prerequisites for Frontend').props.onClick(); ui.render()
  ui.field('Prerequisite for Frontend').props.onChange({ target: { value: 'API' } }); ui.render()
  const form = ui.render().find(node => node.type === 'form')
  form.props.onSubmit({ preventDefault() {} }); await tick(); ui.render()
  assert.equal(ui.field('Prerequisite for Frontend').props.value, 'API')
  assert.match(ui.text(), /Task changed/)
  ui.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await tick()
  assert.equal(ui.calls[1][1].expectedVersion, 2)
  assert.notEqual(ui.calls[0][1].commandId, ui.calls[1][1].commandId)
})

test('uncertain prerequisite command survives unmount and reload for the same user and workspace', async () => {
  const ui = harness({ mutate: async () => ({ error: 'Unknown result', code: 'unavailable', unknownOutcome: true }) })
  ui.render(); await tick(); ui.render()
  ui.button('Edit prerequisites for Frontend').props.onClick(); ui.render()
  ui.button('Remove API prerequisite').props.onClick(); await tick(); ui.render()
  const original = ui.calls[0][1]
  ui.unmount()
  const restored = harness({ storage: ui.storage })
  restored.render(); await tick(); restored.render()
  assert.ok(restored.button('Retry change'))
  await restored.button('Retry change').props.onClick(); await tick(); restored.render()
  assert.deepEqual(restored.calls[0][1], original)
  assert.equal(restored.storage.size, 0)
})

test('prerequisite mutations do not begin if recovery cannot be saved', async () => {
  const ui = harness({ storageFails: true })
  ui.render(); await tick(); ui.render()
  ui.button('Edit prerequisites for Frontend').props.onClick(); ui.render()
  ui.button('Remove API prerequisite').props.onClick(); await tick(); ui.render()
  assert.equal(ui.calls.length, 0)
  assert.match(ui.text(), /storage/i)
})

test('pending recovery is scoped to its user and workspace and retained during access denial', async () => {
  const original = harness({ mutate: async () => ({ error: 'Unknown result', code: 'unavailable', unknownOutcome: true }) })
  original.render(); await tick(); original.render()
  original.button('Edit prerequisites for Frontend').props.onClick(); original.render()
  original.button('Remove API prerequisite').props.onClick(); await tick(); original.render(); original.unmount()
  const otherUser = harness({ storage: original.storage })
  otherUser.render({ currentUserEmail: 'other@test.com' }); await tick(); otherUser.render()
  assert.equal(otherUser.button('Retry change'), undefined)
  const otherWorkspace = harness({ storage: original.storage })
  otherWorkspace.render({ workspace: { id: 'other-workspace', ownerId: 'owner@test.com' } }); await tick(); otherWorkspace.render()
  assert.equal(otherWorkspace.button('Retry change'), undefined)
  const denied = harness({ storage: original.storage, read: async () => ({ error: 'Access denied', code: 'forbidden' }), mutate: async () => ({ error: 'Access denied', code: 'forbidden' }) })
  denied.render(); await tick(); denied.render()
  await denied.button('Retry change').props.onClick(); await tick(); denied.render()
  assert.equal(denied.storage.size, 1)
  assert.ok(denied.button('Retry change'))
  assert.doesNotMatch(denied.text(), /Frontend|API/)
})

test('a rate-limited recovery survives remount and reconciles using the original command', async () => {
  let attempts = 0
  const ui = harness({ mutate: async () => ++attempts === 1
    ? { error: 'Unknown result', code: 'unavailable', unknownOutcome: true }
    : { error: 'Try later', code: 'rate_limited', retryAfterSeconds: 30 } })
  ui.render(); await tick(); ui.render()
  ui.button('Edit prerequisites for Frontend').props.onClick(); ui.render()
  ui.button('Remove API prerequisite').props.onClick(); await tick(); ui.render()
  const original = ui.calls[0][1]
  await ui.button('Retry change').props.onClick(); await tick(); ui.render()
  assert.ok(ui.button('Retry change'))
  assert.equal(ui.storage.size, 1)
  ui.unmount()
  const restored = harness({ storage: ui.storage })
  restored.render(); await tick(); restored.render()
  await restored.button('Retry change').props.onClick(); await tick(); restored.render()
  assert.deepEqual(restored.calls[0][1], original)
  assert.equal(restored.storage.size, 0)
})

test('a definitive recovery conflict clears the command and preserves the draft against the refreshed version', async () => {
  let attempts = 0, version = 1
  const ui = harness({
    read: async () => ({ ...graph, dependencies: [], tasks: graph.tasks.map(task => ({ ...task, version })) }),
    mutate: async () => ++attempts === 1
      ? { error: 'Unknown result', code: 'unavailable', unknownOutcome: true }
      : attempts === 2 ? { error: 'Task changed. Review and retry.', code: 'conflict' }
        : { success: true, task: task('Frontend', { version: 3 }) },
  })
  ui.render(); await tick(); ui.render()
  ui.button('Edit prerequisites for Frontend').props.onClick(); ui.render()
  ui.field('Prerequisite for Frontend').props.onChange({ target: { value: 'API' } }); ui.render()
  ui.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await tick(); ui.render()
  const original = ui.calls[0][1]
  version = 2
  await ui.button('Retry change').props.onClick(); await tick(); ui.render()
  assert.equal(ui.button('Retry change'), undefined)
  assert.equal(ui.storage.size, 0)
  assert.match(ui.text(), /Task changed/)
  assert.equal(ui.field('Prerequisite for Frontend').props.value, 'API')
  ui.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await tick(); ui.render()
  assert.deepEqual(ui.calls[1][1], original)
  assert.equal(ui.calls[2][1].expectedVersion, 2)
  assert.notEqual(ui.calls[2][1].commandId, original.commandId)
})
