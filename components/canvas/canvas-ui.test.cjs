const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const jsx = (type, props) => ({ type, props })
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
function load(path, dependencies, browser) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', 'window', code)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, browser)
  return exports
}
const runtime = { 'react/jsx-runtime': { jsx, jsxs: jsx } }
const flags = { '@/lib/feature-flags': { resolveFeatureFlags: () => ({ aiWorkspace: true, csvImport: true }) } }

test('canvas route redirects anonymous accounts before mounting the client surface', async () => {
  const route = load('app/canvas/page.tsx', { ...runtime, ...flags, '@/lib/auth-simple': { getSession: async () => null },
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`) } }, '@/components/canvas/canvas-shell': { CanvasShell: 'CanvasShell' } })
  await assert.rejects(route.default(), /redirect:\/login/)
})

test('canvas route distinguishes unavailable identity from an authenticated client', async () => {
  const make = read => load('app/canvas/page.tsx', { ...runtime, ...flags, '@/lib/auth-simple': { getSession: read },
    'next/navigation': { redirect() { throw new Error('Unexpected redirect') } }, '@/components/canvas/canvas-shell': { CanvasShell: 'CanvasShell' } })
  const unavailable = await make(async () => { throw new Error('Identity offline') }).default()
  assert.equal(nodes(unavailable).some(node => node.type === 'CanvasShell'), false)
  assert.equal(nodes(unavailable).some(node => node.props?.role === 'alert'), true)
  const authenticated = await make(async () => ({ email: 'member@example.test', id: 'stable-actor' })).default()
  assert.equal(authenticated.type, 'CanvasShell')
  assert.equal(authenticated.props.email, 'member@example.test')
  assert.equal(authenticated.props.actorId, 'stable-actor')
  assert.equal(authenticated.props.aiEnabled, true)
})

function bar(overrides = {}) {
  const slots = [], listeners = new Map(), calls = []
  let cursor = 0, tree
  const props = { scopeName: 'Workspace', tasks: [{ id: 'a', title: 'Allowed task', completed: false }], selectedTask: { id: 'a', title: 'Allowed task', completed: false },
    canComplete: true, disabled: false, busy: false, onCreate: () => calls.push('create'), onComplete: () => calls.push('complete'), onOpenTask: id => calls.push(id), onWorkspace() {}, onList() {}, ...overrides }
  const react = { useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value }] }, useRef(initial) { return slots[cursor++] ??= { current: initial } }, useMemo: fn => fn(),
    useEffect(fn) { cursor++; fn() } }
  const ui = { Command: 'Command', CommandEmpty: 'CommandEmpty', CommandGroup: 'CommandGroup', CommandInput: 'CommandInput', CommandItem: 'CommandItem', CommandList: 'CommandList', CommandSeparator: 'CommandSeparator' }
  const exports = load('components/canvas/canvas-command-bar.tsx', { ...runtime, react, '@/components/ui/command': ui, '@/components/ui/button': { Button: 'Button' } },
    { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {} })
  function render() { cursor = 0; tree = exports.CanvasCommandBar(props); return nodes(tree) }
  render()
  render().find(node => node.type === 'CommandInput').props.onFocus()
  return { render, calls, listeners, update(changes) { Object.assign(props, changes); render() }, action(text) { return render().find(node => node.type === 'CommandItem' && JSON.stringify(node.props.children).includes(text)) } }
}

test('bottom bar opens canonical current-scope task IDs and explicit actions', () => {
  const ui = bar()
  ui.action('Allowed task').props.onSelect()
  assert.deepEqual(ui.calls, ['complete'])
  ui.render().find(node => node.type === 'CommandInput').props.onFocus()
  const task = ui.render().find(node => node.type === 'CommandItem' && node.props.value.startsWith('a '))
  task.props.onSelect()
  assert.deepEqual(ui.calls, ['complete', 'a'])
})

test('completion is absent for unauthorized and already completed tasks', () => {
  for (const overrides of [{ canComplete: false }, { selectedTask: { id: 'a', title: 'Allowed task', completed: true } }]) {
    const ui = bar(overrides)
    assert.equal(ui.render().some(node => node.type === 'CommandItem' && node.props.value.startsWith('complete ')), false)
  }
})

test('read-only command access preserves navigation while hiding task creation', () => {
  const ui = bar({ canCreate: false, canComplete: false })
  assert.equal(ui.action('Create task'), undefined)
  assert.equal(ui.action('Open workspace').props.disabled, false)
})

test('busy and denied scopes prevent dispatch when handlers are invoked directly', () => {
  for (const overrides of [{ disabled: true }, { busy: true }]) {
    const ui = bar(overrides)
    const action = ui.action('Create task')
    assert.equal(action.props.disabled, true)
    action.props.onSelect()
    assert.deepEqual(ui.calls, [])
  }
})

test('command search never retains task items after its authorized dataset is removed', () => {
  const ui = bar()
  assert.equal(ui.render().some(node => node.props?.value?.startsWith('a ')), true)
  ui.update({ tasks: [], selectedTask: null, disabled: true })
  assert.equal(ui.render().some(node => node.props?.value?.startsWith('a ')), false)
})

test('stopping agent follow remains available after write permissions are lost', () => {
  let stopped = 0
  const ui = bar({ disabled: true, followingAgent: true, onStopFollowing: () => stopped++ })
  const stop = ui.render().find(node => node.type === 'Button' && node.props.children === 'Stop following')
  assert.notEqual(stop.props.disabled, true)
  stop.props.onClick()
  assert.equal(stopped, 1)
  assert.deepEqual(ui.calls, [])
})

test('Enter on a collapsed command bar opens results without executing a hidden action', () => {
  const ui = bar()
  ui.render().find(node => node.type === 'Command').props.onKeyDown({ key: 'Escape', stopPropagation() {} })
  assert.equal(ui.render().find(node => node.type === 'CommandList').props.hidden, true)
  let prevented = false
  ui.render().find(node => node.type === 'Command').props.onKeyDownCapture({ key: 'Enter', preventDefault() { prevented = true }, stopPropagation() {} })
  assert.equal(prevented, true)
  assert.equal(ui.render().find(node => node.type === 'CommandList').props.hidden, false)
  assert.deepEqual(ui.calls, [])
})

test('Ask is an explicit optional command and never runs while searching', () => {
  let asked = 0
  const ui = bar({ onAsk: () => asked++ })
  ui.render().find(node => node.type === 'CommandInput').props.onValueChange('Plan a release')
  assert.equal(asked, 0)
  ui.action('Ask Saathi').props.onSelect()
  assert.equal(asked, 1)
  assert.equal(bar().action('Ask Saathi'), undefined)
})

test('workspace tools are discoverable without granting management controls', () => {
  const opened = []
  const ui = bar({ onTool: tool => opened.push(tool), canManage: false, canEdit: false })
  for (const [label, tool] of [['Agent runs', 'agents'], ['Team', 'team'], ['History', 'activity']]) {
    ui.action(label).props.onSelect()
    assert.equal(opened.at(-1), tool)
  }
  assert.equal(ui.action('Settings'), undefined)
  assert.equal(ui.action('Prerequisites'), undefined)
  const editable = bar({ onTool: tool => opened.push(tool), canManage: true, canEdit: true })
  editable.action('Prerequisites').props.onSelect()
  editable.action('Settings').props.onSelect()
  assert.deepEqual(opened.slice(-2), ['prerequisites', 'settings'])
})

test('account destinations remain reachable when no workspace is selected', () => {
  const paths = [], ui = bar({ disabled: true, onNavigate: path => paths.push(path) })
  assert.equal(ui.render().find(node => node.type === 'CommandInput').props.disabled, false)
  ui.action('Archive').props.onSelect()
  ui.action('Connections').props.onSelect()
  assert.deepEqual(paths, ['/archive', '/connections'])
})

test('large command menus stay bounded while search reaches tasks beyond the first page', () => {
  const tasks = Array.from({ length: 750 }, (_, index) => ({ id: `task-${index}`, title: `Delivery ${index}` }))
  const ui = bar({ tasks })
  const taskItems = () => ui.render().filter(node => node.type === 'CommandItem' && node.props.value.startsWith('task-'))
  assert.ok(taskItems().length <= 50)
  ui.render().find(node => node.type === 'CommandInput').props.onValueChange('Delivery 749')
  assert.equal(taskItems().length, 1)
  taskItems()[0].props.onSelect()
  assert.deepEqual(ui.calls, ['task-749'])
})

function shell({ aiEnabled = true, create = true, confirm = async () => ({}), reload = async () => true, rawFocus = { kind: 'overview' }, reconciledFocus } = {}) {
  const created = [], selected = []
  const workspace = { id: 'workspace', name: 'Delivery', ownerId: 'owner@example.test', timezone: 'UTC', members: [], capabilityCeiling: { read: true, create } }
  const store = { workspaces: [workspace], currentWorkspaceId: workspace.id, realtime: { eventRevision: 0 }, refreshWorkspaces: async () => {}, setCurrentWorkspaceId: id => selected.push(id) }
  const plan = { title: 'Release', summary: 'Ship together', targetDate: null, tasks: [] }
  const suggest = async () => ({ plan })
  const react = { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useRef: current => ({ current }), useMemo: fn => fn(), useCallback: fn => fn, useEffect() {}, useLayoutEffect() {} }
  const dependencies = { ...runtime, react, 'next/dynamic': { default: () => 'CanvasFlow' }, 'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/hooks/use-workspaces': { useWorkspaces: () => store }, '@/hooks/use-canvas-graph': { useCanvasGraph: () => ({ entry: { graph: { tasks: [] } }, reload }) },
    './use-canvas-resources': { useCanvasResources: () => ({ resources: [], references: [], reload: async () => {} }) },
    '@/features/canvas/model': { createCanvasNavigation: () => ({ focus: rawFocus }), reconcileCanvasNavigation: navigation => reconciledFocus ? { ...navigation, focus: reconciledFocus, followingAgent: false } : navigation, projectCanvas: () => ({ nodes: [] }), cameraStorageKey: () => 'camera' },
    '@/lib/identity': { normalizeEmail: value => value.toLowerCase() }, '@/lib/capability-ceiling': { permitsCapability: (ceiling, capability) => Boolean(ceiling[capability]) },
    '@/features/access/contracts': { ACCESS_CAPABILITIES: ['read', 'create', 'edit', 'manage', 'delete'] },
    '@/app/actions/workspace-intent': { generateWorkspaceDraft: suggest, createWorkspaceFromPlan: async (input, commandId) => { created.push({input,commandId}); return { workspace: { id: 'new-workspace' } } } },
    '@/app/actions/workspace-advisor': { confirmWorkspaceAdvisorDraft: confirm },
  }
  // Presentation components are opaque nodes; execute the actual shell callbacks.
  const deps = new Proxy(dependencies, { has: () => true, get: (target, name) => name in target ? target[name] : new Proxy({}, { get: (_, component) => component }) })
  const { CanvasShell } = load('components/canvas/canvas-shell.tsx', deps)
  const tree = CanvasShell({ email: 'owner@example.test', actorId: 'actor', aiEnabled })
  return { nodes: nodes(tree), created, selected, plan, suggest }
}

test('canvas uses the reviewed workspace planner and selects its committed result', async () => {
  const ui = shell(), form = ui.nodes.find(node => node.type === 'WorkspaceCreateForm')
  assert.equal(form.props.aiEnabled, true)
  assert.equal(form.props.onSuggest, ui.suggest)
  await form.props.onApprove(ui.plan, "same-create-command")
  assert.deepEqual(ui.created, [{ input: ui.plan, commandId: "same-create-command" }])
  assert.deepEqual(ui.selected, ['new-workspace'])
})

test('canvas advisor keeps exact command identity and a committed task after refresh failure', async () => {
  const calls = [], task = { id: 'created-task' }
  const ui = shell({ confirm: async (...args) => { calls.push(args); return { task } }, reload: async () => false })
  const advisor = ui.nodes.find(node => node.type === 'WorkspaceAdvisor')
  const proposal = { title: 'Review release' }
  const result = await advisor.props.onConfirmDraft(proposal, 'same-command')
  assert.deepEqual(calls, [['workspace', proposal, 'same-command']])
  assert.equal(result.task, task)
  assert.match(result.warning, /Task created/)
})

test('disabled AI and missing creation capability leave manual canvas navigation available', () => {
  for (const options of [{ aiEnabled: false }, { create: false }]) {
    const ui = shell(options), bar = ui.nodes.find(node => node.type === 'CanvasCommandBar')
    assert.equal(bar.props.onAsk, undefined)
    assert.equal(ui.nodes.some(node => node.type === 'WorkspaceAdvisor'), false)
    assert.equal(typeof bar.props.onNavigate, 'function')
    if (options.create === false) assert.equal(bar.props.onImport, undefined)
  }
})

test('canvas camera receives the reconciled focus after the selected task disappears', () => {
  const fallback = { kind: 'workspace', workspaceId: 'workspace' }
  const ui = shell({ rawFocus: { kind: 'task', workspaceId: 'workspace', taskId: 'deleted-task' }, reconciledFocus: fallback })
  assert.deepEqual(ui.nodes.find(node => node.type === 'CanvasFlow').props.focus, fallback)
})
