const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
function harness(options = {}) {
  const slots = [], effects = [], calls = [], storage = options.storage ?? new Map()
  let cursor = 0, tree, refreshes = 0
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i])
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn() }) } },
  }
  const browserStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (options.storageFails) throw new Error('Storage denied'); storage.set(key, value) }, removeItem: key => storage.delete(key) }
  const jsx = (type, props) => ({ type, props })
  const dependencies = { '@/features/canvas/model': require('../../features/canvas/model.ts'), react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' },
    '@/features/access/contracts': { ACCESS_CAPABILITIES: ['read', 'create', 'edit', 'comment', 'manage', 'delete'] },
    '@/features/access/actions': { getCanvasResourceAccess: async id => options.details ? { success: true, details: options.details(id) } : { success: false, error: 'Unavailable' }, runCanvasAccessCommand: async command => {
      calls.push(command)
      assert.deepEqual(JSON.parse([...storage.values()][0]), command, 'exact command must be retained before dispatch')
      return options.mutate ? options.mutate(command) : { success: true, result: { id: command.input.id, version: 1, affectedWorkspaceIds: [], replayed: false } }
    } },
  }
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync('components/canvas/company-panel.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', 'sessionStorage', 'window', code)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, browserStorage, { confirm: () => true })
  const props = { actorId: 'actor', resources: options.resources ?? [], onChanged: async () => { refreshes++ }, onWorkspace() {}, onInvite() {}, ...options.props }
  return { render() { cursor = 0; tree = exports.CompanyPanel(props); effects.splice(0).forEach(fn => fn()); return nodes(tree) },
    create() { const fields = this.render(); fields.find(node => node.props?.id === 'canvas-company-name').props.onChange({ target: { value: 'Company' } }); return this.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }) },
    button(label) { return this.render().find(node => node.type === 'Button' && node.props.children === label) },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) }, calls, storage, get refreshes() { return refreshes }, text() { return JSON.stringify(tree) } }
}

test('sharing workspace B invites to B even when workspace A is current', async () => {
  const invites = []
  const resource = { id: 'resource-b', workspaceId: 'workspace-b', organizationId: 'company', name: 'Workspace B', kind: 'workspace', capabilities: ['read', 'manage'], version: 1 }
  const ui = harness({ resources: [resource], props: { workspace: { id: 'workspace-a', name: 'Workspace A', members: [] }, onInvite: id => invites.push(id) }, details: () => ({ resource, members: [], groups: [], grants: [] }) })
  ui.render(); await tick(); ui.render()
  const invite = ui.render().find(node => node.type === 'Button' && String(node.props.children).includes('invitations'))
  assert.ok(invite)
  invite.props.onClick()
  assert.deepEqual(invites, ['workspace-b'])
  assert.match(String(invite.props.children), /Workspace B/)
})

test('editable source links only independently readable same-company destinations using the real retained command', async () => {
  const resource = (id, organizationId, capabilities) => ({ id, name: id, organizationId, capabilities, kind: 'section', parentId: null, mode: 'restricted', version: 1, workspaceId: null })
  const ui = harness({ resources: [resource('source', 'company', ['read', 'edit']), resource('target', 'company', ['read']), resource('hidden', 'company', []), resource('foreign', 'other', ['read'])] })
  ui.render()
  const selector = ui.render().find(node => node.props?.id === 'canvas-link-target')
  const options = nodes(selector).filter(node => node.type === 'option').map(node => node.props.value)
  assert.deepEqual(options, ['', 'target'])
  selector.props.onChange({ target: { value: 'target' } })
  ui.render().find(node => node.type === 'form' && nodes(node).some(child => child.props?.id === 'canvas-link-target')).props.onSubmit({ preventDefault() {} })
  await tick()
  assert.equal(ui.calls[0].operation, 'reference.create')
  assert.equal(ui.calls[0].input.canvasResourceId, 'source')
  assert.equal(ui.calls[0].input.targetResourceId, 'target')
  assert.equal(ui.refreshes, 1)
})

test('company command dispatch persists exact input first and rejects duplicate submits', async () => {
  let finish
  const ui = harness({ mutate: () => new Promise(resolve => { finish = resolve }) })
  ui.render(); ui.create(); ui.create()
  assert.equal(ui.calls.length, 1)
  finish({ success: true, result: { id: ui.calls[0].input.id, version: 1 } }); await tick(); ui.render()
  assert.equal(ui.storage.size, 0)
  assert.equal(ui.refreshes, 1)
})

test('unknown access outcomes survive remount and retry the same original command', async () => {
  const first = harness({ mutate: async () => ({ success: false, code: 'unavailable', error: 'Unknown outcome', unknownOutcome: true }) })
  first.render(); first.create(); await tick(); first.render(); first.unmount()
  const restored = harness({ storage: first.storage })
  restored.render(); restored.render()
  restored.button('Retry original change').props.onClick(); await tick(); restored.render()
  assert.deepEqual(restored.calls[0], first.calls[0])
  assert.equal(restored.storage.size, 0)
})

test('storage failure blocks permission mutation rather than losing recovery identity', async () => {
  const ui = harness({ storageFails: true })
  ui.render(); ui.create(); await tick(); ui.render()
  assert.equal(ui.calls.length, 0)
  assert.match(ui.text(), /storage is unavailable/)
})

test('a definitive conflict clears its command and refreshes current policy before another edit', async () => {
  const ui = harness({ mutate: async () => ({ success: false, code: 'conflict', error: 'Resource changed' }) })
  ui.render(); ui.create(); await tick(); ui.render()
  assert.equal(ui.storage.size, 0)
  assert.equal(ui.button('Retry original change'), undefined)
  assert.equal(ui.refreshes, 1)
  assert.match(ui.text(), /Resource changed/)
})

test('same-name sharing destinations include their authorized ancestor path and type', () => {
  const ui = harness({ resources: [
    { id: 'a', name: 'Acme', parentId: null, kind: 'organization', capabilities: ['read'] },
    { id: 'b', name: 'Beta', parentId: null, kind: 'organization', capabilities: ['read'] },
    { id: 's1', name: 'Delivery', parentId: 'a', kind: 'section', capabilities: ['read'] },
    { id: 's2', name: 'Delivery', parentId: 'b', kind: 'section', capabilities: ['read'] },
  ] })
  const selector = ui.render().find(node => node.props?.id === 'canvas-resource')
  const labels = nodes(selector).filter(node => node.type === 'option').map(node => JSON.stringify(node.props.children))
  assert.ok(labels.some(label => label.includes('Acme / Delivery') && label.includes('section')))
  assert.ok(labels.some(label => label.includes('Beta / Delivery') && label.includes('section')))
})
