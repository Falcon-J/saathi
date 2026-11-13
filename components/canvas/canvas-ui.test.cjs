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

test('canvas route redirects anonymous accounts before mounting the client surface', async () => {
  const route = load('app/canvas/page.tsx', { ...runtime, '@/lib/auth-simple': { getSession: async () => null },
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`) } }, '@/components/canvas/canvas-shell': { CanvasShell: 'CanvasShell' } })
  await assert.rejects(route.default(), /redirect:\/login/)
})

test('canvas route distinguishes unavailable identity from an authenticated client', async () => {
  const make = read => load('app/canvas/page.tsx', { ...runtime, '@/lib/auth-simple': { getSession: read },
    'next/navigation': { redirect() { throw new Error('Unexpected redirect') } }, '@/components/canvas/canvas-shell': { CanvasShell: 'CanvasShell' } })
  const unavailable = await make(async () => { throw new Error('Identity offline') }).default()
  assert.equal(nodes(unavailable).some(node => node.type === 'CanvasShell'), false)
  assert.equal(nodes(unavailable).some(node => node.props?.role === 'alert'), true)
  const authenticated = await make(async () => ({ email: 'member@example.test', id: 'stable-actor' })).default()
  assert.equal(authenticated.type, 'CanvasShell')
  assert.equal(authenticated.props.email, 'member@example.test')
  assert.equal(authenticated.props.actorId, 'stable-actor')
})

function bar(overrides = {}) {
  const slots = [], listeners = new Map(), calls = []
  let cursor = 0, tree
  const props = { scopeName: 'Workspace', tasks: [{ id: 'a', title: 'Allowed task', completed: false }], selectedTask: { id: 'a', title: 'Allowed task', completed: false },
    canComplete: true, disabled: false, busy: false, onCreate: () => calls.push('create'), onComplete: () => calls.push('complete'), onOpenTask: id => calls.push(id), onWorkspace() {}, onList() {}, ...overrides }
  const react = { useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value }] }, useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect(fn) { cursor++; fn() } }
  const ui = { Command: 'Command', CommandEmpty: 'CommandEmpty', CommandGroup: 'CommandGroup', CommandInput: 'CommandInput', CommandItem: 'CommandItem', CommandList: 'CommandList', CommandSeparator: 'CommandSeparator' }
  const exports = load('components/canvas/canvas-command-bar.tsx', { ...runtime, react, './use-canvas-search': { useCanvasSearch: () => ({ items: [], loading: false }) }, '@/components/ui/command': ui, '@/components/ui/button': { Button: 'Button' } },
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

test('broad task searches cannot dispatch the unrelated current-workspace action on Enter', () => {
  const ui = bar({ searchScope: {} })
  ui.render().find(node => node.type === 'CommandInput').props.onValueChange('Exact task title')
  assert.equal(ui.action('Open workspace'), undefined)
  ui.render().find(node => node.type === 'CommandInput').props.onValueChange('open work')
  assert.equal(ui.action('Open workspace'), undefined)
})

test('canvas search input preserves the server query length boundary', () => {
  assert.equal(bar().render().find(node => node.type === 'CommandInput').props.maxLength, 120)
})

test('company and overview commands never expose an unrelated workspace action',()=>{
 const ui=bar({searchScope:{resourceId:'company'},scopeName:'Canvas / Company',scopeLabel:'Company'});
 assert.equal(ui.render().some(n=>n.type==='Button'&&n.props.children==='Task list'),false);
 ui.render().find(n=>n.type==='CommandInput').props.onValueChange('open work');
 assert.equal(ui.action('Open workspace'),undefined);
 const scope=ui.render().find(n=>n.props?.['aria-label']==='Command scope');
 assert.equal(scope.props.children,'Company');assert.equal(scope.props.title,'Canvas / Company');
});
