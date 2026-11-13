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
const runtime = { 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/features/canvas/navigation-url': require('../../features/canvas/navigation-url.ts') }

test('canvas route redirects anonymous accounts before mounting the client surface', async () => {
  const route = load('app/canvas/page.tsx', { ...runtime, '@/lib/auth-simple': { getSession: async () => null },
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`) } }, '@/components/canvas/canvas-shell': { CanvasShell: 'CanvasShell' } })
  await assert.rejects(route.default({}), /redirect:\/login/)
})

test('canvas route distinguishes unavailable identity from an authenticated client', async () => {
  const make = read => load('app/canvas/page.tsx', { ...runtime, '@/lib/auth-simple': { getSession: read },
    'next/navigation': { redirect() { throw new Error('Unexpected redirect') } }, '@/components/canvas/canvas-shell': { CanvasShell: 'CanvasShell' } })
  const unavailable = await make(async () => { throw new Error('Identity offline') }).default({})
  assert.equal(nodes(unavailable).some(node => node.type === 'CanvasShell'), false)
  assert.equal(nodes(unavailable).some(node => node.props?.role === 'alert'), true)
  const authenticated = await make(async () => ({ email: 'member@example.test', id: 'stable-actor' })).default({})
  assert.equal(authenticated.type, 'CanvasShell')
  assert.equal(authenticated.props.email, 'member@example.test')
  assert.equal(authenticated.props.actorId, 'stable-actor')
})

function bar(overrides = {}) {
  const slots = [], listeners = new Map(), calls = []
  let cursor = 0, tree
  const props = { scopeName: 'Workspace', tasks: [{ id: 'a', title: 'Allowed task', completed: false }], selectedTask: { id: 'a', title: 'Allowed task', completed: false },
    canComplete: true, disabled: false, busy: false, onCreate: () => calls.push('create'), onComplete: () => calls.push('complete'), onOpenTask: id => calls.push(id), onWorkspace() {}, onList: () => calls.push('list'), ...overrides }
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

test('direct new task uses the guarded create action and closes search results', () => {
  const ui = bar({ selectedTask: null })
  ui.render().find(node => node.type === 'CommandInput').props.onValueChange('draft')
  const create = ui.render().find(node => node.type === 'Button' && node.props['aria-label'] === 'New task')
  assert.ok(create)
  create.props.onClick()
  assert.deepEqual(ui.calls, ['create'])
  assert.equal(ui.render().find(node => node.type === 'CommandList').props.hidden, true)
  assert.equal(ui.render().find(node => node.type === 'CommandInput').props.value, '')
})

test('collapsed search leaves Enter available to activate the direct new task button', () => {
  const ui = bar({ selectedTask: null })
  ui.render().find(node => node.type === 'Command').props.onKeyDown({ key: 'Escape', stopPropagation() {} })
  let prevented = false
  ui.render().find(node => node.type === 'Command').props.onKeyDownCapture({ key: 'Enter', target: { closest: selector => selector === 'button' }, preventDefault() { prevented = true }, stopPropagation() {} })
  assert.equal(prevented, false)
  assert.equal(ui.render().find(node => node.type === 'CommandList').props.hidden, true)
  const create = ui.render().find(node => node.type === 'Button' && node.props['aria-label'] === 'New task')
  let stopped = false
  create.props.onKeyDown({ key: 'Enter', stopPropagation() { stopped = true } })
  assert.equal(stopped, true)
  create.props.onClick()
  assert.deepEqual(ui.calls, ['create'])
})

test('Escape from the direct new task button dismisses open results', () => {
  const ui = bar({ selectedTask: null })
  assert.equal(ui.render().find(node => node.type === 'CommandList').props.hidden, false)
  const event = { key: 'Escape', stopped: false, stopPropagation() { this.stopped = true } }
  ui.render().find(node => node.type === 'Button' && node.props['aria-label'] === 'New task').props.onKeyDown(event)
  if (!event.stopped) ui.render().find(node => node.type === 'Command').props.onKeyDown(event)
  assert.equal(ui.render().find(node => node.type === 'CommandList').props.hidden, true)
  assert.deepEqual(ui.calls, [])
})

test('direct new task respects creation permission, search scope and admission guards', () => {
  for (const overrides of [{ canCreate: false }, { searchScope: {} }, { searchScope: { resourceId: 'company' } }]) {
    assert.equal(bar({ selectedTask: null, ...overrides }).render().some(node => node.type === 'Button' && node.props['aria-label'] === 'New task'), false)
  }
  for (const overrides of [{ disabled: true }, { busy: true }]) {
    const ui = bar({ selectedTask: null, ...overrides })
    const create = ui.render().find(node => node.type === 'Button' && node.props['aria-label'] === 'New task')
    assert.ok(create)
    assert.equal(create.props.disabled, true)
    create.props.onClick()
    assert.deepEqual(ui.calls, [])
  }
})

test('task list is a searchable workspace action that closes results on selection', () => {
  const ui = bar({ canCreate: false, canComplete: false })
  const list = ui.action('Task list')
  assert.ok(list)
  for (const query of ['task', 'list', 'show all']) assert.ok(list.props.value.includes(query))
  list.props.onSelect()
  assert.deepEqual(ui.calls, ['list'])
  assert.equal(ui.render().find(node => node.type === 'CommandList').props.hidden, true)
  for (const searchScope of [{}, { resourceId: 'company' }]) assert.equal(bar({ searchScope }).action('Task list'), undefined)
})

test('task list action cannot dispatch while busy or denied', () => {
  for (const overrides of [{ disabled: true }, { busy: true }]) {
    const ui = bar(overrides)
    const list = ui.action('Task list')
    assert.ok(list)
    assert.equal(list.props.disabled, true)
    list.props.onSelect()
    assert.deepEqual(ui.calls, [])
  }
})

test('company and overview commands never expose an unrelated workspace action',()=>{
 const ui=bar({searchScope:{resourceId:'company'},scopeName:'Canvas / Company',scopeLabel:'Company'});
 assert.equal(ui.render().some(n=>n.type==='Button'&&n.props.children==='Task list'),false);
 ui.render().find(n=>n.type==='CommandInput').props.onValueChange('open work');
 assert.equal(ui.action('Open workspace'),undefined);
 const scope=ui.render().find(n=>n.props?.['aria-label']==='Command scope');
 assert.equal(scope.props.children,'Company');assert.equal(scope.props.title,'Canvas / Company');
});

test('native phone viewport keeps zoom available and opts into content resizing',()=>{
 const layout=load('app/layout.tsx',{...runtime,'@/components/theme-provider':{ThemeProvider:'ThemeProvider'},'@/components/history-position-provider':{HistoryPositionProvider:'HistoryPositionProvider'},'@/components/ui/toaster':{Toaster:'Toaster'},'./globals.css':{}});
 assert.equal(layout.viewport.width,'device-width');assert.equal(layout.viewport.initialScale,1);
 assert.notEqual(layout.viewport.viewportFit,'cover');assert.equal(layout.viewport.interactiveWidget,'resizes-content');
 assert.notEqual(layout.viewport.userScalable,false);assert.equal(layout.viewport.maximumScale,undefined);
});

test('selected actionable tasks get one direct Complete action using the same guarded command',()=>{
 const ui=bar();const action=ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Complete Allowed task');
 assert.ok(action);assert.equal(ui.render().some(n=>n.type==='Button'&&n.props['aria-label']==='New task'),false);
 action.props.onClick();assert.deepEqual(ui.calls,['complete']);assert.equal(ui.render().find(n=>n.type==='CommandList').props.hidden,true);
 for(const overrides of [{busy:true},{disabled:true}]){const blocked=bar(overrides);const button=blocked.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Complete Allowed task');assert.equal(button.props.disabled,true);button.props.onClick();assert.deepEqual(blocked.calls,[]);}
 for(const overrides of [{canComplete:false},{selectedTask:null},{selectedTask:{id:'a',title:'Allowed task',completed:true}},{selectedTask:{id:'a',title:'Allowed task',status:'done',completed:false}},{searchScope:{}}])assert.equal(bar(overrides).render().some(n=>n.type==='Button'&&n.props['aria-label']==='Complete Allowed task'),false);
});

test('signed-out canvas links retain their bounded task destination through sign-in', async () => {
 const route=load('app/canvas/page.tsx',{...runtime,'@/lib/auth-simple':{getSession:async()=>null},'next/navigation':{redirect:path=>{throw new Error(path)}},'@/components/canvas/canvas-shell':{CanvasShell:'CanvasShell'}});
 const destination='/canvas?workspace=w&task=t&view=tasks';
 await assert.rejects(route.default({searchParams:Promise.resolve({workspace:'w',task:'t',view:'tasks'})}), error=>new URL(error.message,'https://saathi.test').searchParams.get('redirect')===destination);
 await assert.rejects(route.default({searchParams:Promise.resolve({workspace:['w','other'],task:'t',view:'tasks',redirect:'//outside.test'})}), error=>new URL(error.message,'https://saathi.test').searchParams.get('redirect')==='/canvas');
});
test('an unavailable canvas account can retry the same valid task link', async () => {
 const route=load('app/canvas/page.tsx',{...runtime,'@/lib/auth-simple':{getSession:async()=>{throw Error('Unavailable')}},'next/navigation':{redirect(){throw Error('Unexpected')}},'@/components/canvas/canvas-shell':{CanvasShell:'CanvasShell'}});
 const tree=await route.default({searchParams:Promise.resolve({workspace:'w',task:'t',view:'tasks'})});
 assert.equal(nodes(tree).find(n=>n.type==='a').props.href,'/canvas?workspace=w&task=t&view=tasks');
});
