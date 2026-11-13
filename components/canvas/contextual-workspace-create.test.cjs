const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]

function mount({ saved, storageFails = false, results = [], confirm = () => true } = {}) {
  const slots = [], effects = [], calls = [], completed = []
  let cursor = 0, sequence = 0
  const storage = new Map(saved ? [['saathi:canvas-workspace-create:actor', JSON.stringify(saved)]] : [])
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value }] },
    useRef(value) { return slots[cursor++] ??= { current: value } },
    useEffect(fn) { const i = cursor++; if (!slots[i]) { slots[i] = true; effects.push(fn) } },
  }
  const jsx = (type, props) => ({ type, props })
  const dependencies = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/workspace-create-form': { WorkspaceCreateForm: 'Form' }, '@/components/ui/button': { Button: 'Button' },
    '@/features/access/actions': { runCanvasAccessCommand: async command => { calls.push(structuredClone(command)); assert.ok(storage.size, 'Request persisted before dispatch'); const next = results.shift(); if (next instanceof Error) throw next; return next ?? { success: true, result: {} } } } }
  const output = {}
  const source = ts.transpileModule(fs.readFileSync('components/canvas/contextual-workspace-create.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', 'sessionStorage', 'crypto', 'window', source)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, output,
    { getItem: key => storage.get(key), setItem(key, value) { if (storageFails) throw new Error('Storage denied'); storage.set(key, value) }, removeItem: key => storage.delete(key) }, { randomUUID: () => `id-${++sequence}` }, { confirm })
  const props = { actorId: 'actor', target: { id: 'section', version: 3, path: 'Company / Section' }, onCancel() {}, onCreated: async id => completed.push(id) }
  return { calls, completed, storage, props, render() { cursor = 0; const tree = output.ContextualWorkspaceCreate(props); effects.splice(0).forEach(fn => fn()); return nodes(tree) } }
}

test('contextual creation persists selected parent and retries the same command after interruption', async () => {
  const ui = mount({ results: [new Error('Transport interrupted'), { success: true, result: {} }] })
  ui.render()
  await ui.render().find(n => n.type === 'Form').props.onCreate('Delivery', { summary: 'Ship', targetDate: '2026-12-01' })
  assert.equal(ui.calls[0].input.parentId, 'section')
  assert.equal(ui.calls[0].input.expectedParentVersion, 3)
  assert.equal(ui.calls[0].input.targetAt, '2026-12-01')
  ui.props.target = { id: 'different-section', version: 9, path: 'Different' }
  await ui.render().find(n => n.type === 'Button').props.onClick()
  assert.deepEqual(ui.calls[1], ui.calls[0])
  assert.deepEqual(ui.completed, [ui.calls[0].input.workspaceId])
  assert.equal(ui.storage.size, 0)
})

test('reload recovers original destination instead of creating in the current section', async () => {
  const saved = { path: 'Original / Section', command: { operation: 'workspace.create', input: { commandId: 'original', workspaceId: 'original-workspace', parentId: 'original-section', expectedParentVersion: 2, resourceId: 'original-resource', name: 'Original' } } }
  const ui = mount({ saved })
  ui.render()
  assert.equal(ui.render().find(n => n.type === 'div' && n.props.hidden !== undefined).props.hidden, true)
  await ui.render().find(n => n.type === 'Button').props.onClick()
  assert.deepEqual(ui.calls, [saved.command])
  assert.deepEqual(ui.completed, ['original-workspace'])
})

test('storage failures block dispatch and retain a visible recovery error', async () => {
  const ui = mount({ storageFails: true })
  ui.render()
  await ui.render().find(n => n.type === 'Form').props.onCreate('Delivery', { summary: '', targetDate: null })
  assert.equal(ui.calls.length, 0)
  assert.ok(ui.render().some(n => n.props?.role === 'alert'))
})

test('definite validation failure keeps creation editable without an unknown pending command', async () => {
  const ui = mount({ results: [{ success: false, error: 'Access denied', code: 'forbidden' }] })
  ui.render()
  await ui.render().find(n => n.type === 'Form').props.onCreate('Delivery', { summary: '', targetDate: null })
  assert.ok(ui.render().some(n => n.type === 'Form'))
  assert.equal(ui.storage.size, 0)
  assert.equal(ui.completed.length, 0)
})

test('a committed creation with a failed refresh retains the exact request for recovery', async () => {
 const ui=mount(); ui.render(); ui.props.onCreated=async()=>{throw new Error('Refresh failed')};
 await ui.render().find(n=>n.type==='Form').props.onCreate('Delivery',{summary:'',targetDate:null});
 assert.equal(ui.storage.size,1); assert.ok(ui.render().some(n=>n.type==='Button'));
 ui.props.onCreated=async id=>ui.completed.push(id);
 await ui.render().find(n=>n.type==='Button').props.onClick();
 assert.deepEqual(ui.calls[1],ui.calls[0]); assert.equal(ui.storage.size,0);
});

test('a forbidden recovered request can be explicitly abandoned without claiming it never committed', async () => {
 const saved={path:'Original section',command:{operation:'workspace.create',input:{commandId:'original',workspaceId:'original-workspace',parentId:'original-section',expectedParentVersion:2,resourceId:'resource',name:'Original'}}};
 let accepted=false, cancelled=0;
 const ui=mount({saved,results:[{success:false,error:'Access denied',code:'forbidden'}],confirm:message=>{assert.match(message,/may already have created/);return accepted}});
 ui.props.onCancel=()=>cancelled++;ui.render();
 await ui.render().find(n=>n.type==='Button'&&n.props.children==='Retry workspace creation').props.onClick();
 assert.equal(ui.storage.size,1);
 ui.render().find(n=>n.type==='Button'&&n.props.children==='Stop recovering').props.onClick();
 assert.equal(ui.storage.size,1);assert.equal(cancelled,0);
 accepted=true;ui.render().find(n=>n.type==='Button'&&n.props.children==='Stop recovering').props.onClick();
 assert.equal(ui.storage.size,0);assert.equal(cancelled,1);assert.equal(ui.completed.length,0);
});
