const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const { createCanvasNavigation, projectCanvas, taskNodeId } = require('../../features/canvas/model.ts')

const workspace = id => ({ id, name: id, timezone: 'UTC', ownerId: 'owner@example.test', ownerUserId: 'owner', members: [], version: 1, targetAt: null, createdAt: '2026-11-12T00:00:00Z' })
const task = { id: 'task', workspaceId: 'a', title: 'Actual task', completed: false, status: 'todo', priority: 'medium', createdBy: 'owner@example.test', createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z', version: 1 }
const navigation = createCanvasNavigation({ actorId: 'actor', canvasId: 'personal' })
const project = (graphs = [], focus = { kind: 'overview' }) => projectCanvas({ graphs, navigation: { ...navigation, focus }, zoom: 1 })
const entry = { workspace: workspace('a'), complete: true, graph: { tasks: [task], dependencies: [], timezone: 'UTC', asOf: '2026-11-12T00:00:00Z' } }

function harness() {
  const slots = [], effects = [], fits = [], opens = []
  let cursor = 0, manual = 0
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i])
  const react = {
    memo: fn => fn,
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = value }] },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useMemo(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value },
    useCallback(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(fn) } },
  }
  const jsx = (type, props) => ({ type, props })
  const dependencies = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next-themes': { useTheme: () => ({ resolvedTheme: 'light' }) },
    '@xyflow/react': { ReactFlow: 'ReactFlow', Background: 'Background', Controls: 'Controls', Handle: 'Handle', Position: { Left: 'left', Right: 'right' } },
    '@xyflow/react/dist/style.css': {}, '@/components/ui/button': { Button: 'Button' },
    '@/features/canvas/model': require('../../features/canvas/model.ts'), '@/lib/task-time': require('../../lib/task-time.ts'), './company-layout': require('./company-layout.ts') }
  const code = ts.transpileModule(fs.readFileSync('components/canvas/canvas-flow.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('require', 'exports', 'localStorage', code)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, { getItem: () => null, setItem() {} })
  let props = { projection: project(), cameraKey: 'actor:personal', resources: [], workspaces: [workspace('a'), workspace('b')], focus: { kind: 'overview' }, followingAgent: false,
    onOpen: focus => opens.push(focus), onOpenResource() {}, onZoom() {}, onManualNavigation: () => manual++ }
  return { render(next = {}) { props = { ...props, ...next }; cursor = 0; const tree = exports.default(props); effects.splice(0).forEach(fn => fn()); return tree.props },
    initialize() { this.render().onInit({ fitView: options => { fits.push(options); return Promise.resolve(true) }, setViewport: () => Promise.resolve(true) }); fits.length = 0 }, fits, opens, get manual() { return manual } }
}

test('renderer receives live associations separately from task prerequisites and removes them with the authorized view', () => {
  const ui = harness()
  const resources = [{ id: 'section', name: 'Section', organizationId: 'company', parentId: null, kind: 'section', mode: 'restricted', workspaceId: null, version: 1, capabilities: ['read'] },
    { id: 'resource', name: 'A', organizationId: 'company', parentId: 'section', kind: 'workspace', mode: 'inherit', workspaceId: 'a', version: 1, capabilities: ['read'] }]
  const flow = ui.render({ resources, references: [{ id: 'link', canvasResourceId: 'section', targetResourceId: 'resource' }] })
  assert.deepEqual(flow.edges.map(edge => edge.id), ['association:link'])
  assert.equal(flow.edges[0].target, 'workspace:a')
  assert.match(flow.edges[0].ariaLabel, /Canvas link from Section to A/)
  assert.deepEqual(ui.render({ resources: [], references: [] }).edges, [])
})

test('overview includes every authorized summary without fabricated readiness and opens canonical identity', () => {
  const ui = harness()
  const flow = ui.render()
  assert.deepEqual(flow.nodes.map(node => node.id), ['workspace:a', 'workspace:b'])
  assert.equal(flow.nodes[1].data.subtitle, undefined)
  flow.nodes[1].data.open()
  assert.deepEqual(ui.opens, [{ kind: 'workspace', workspaceId: 'b' }])
  assert.equal(flow.nodesDraggable, false)
  assert.equal(flow.deleteKeyCode, null)
})

test('manual navigation cancels pending agent camera focus before late graph data arrives', () => {
  const ui = harness(); ui.initialize()
  const focus = { kind: 'task', workspaceId: 'a', taskId: 'task' }
  const pending = ui.render({ focus, followingAgent: true })
  assert.equal(ui.fits.length, 0)
  pending.onMoveStart({ type: 'wheel' })
  ui.render({ followingAgent: false })
  ui.render({ projection: project([entry], focus) })
  assert.equal(ui.manual, 1)
  assert.equal(ui.fits.length, 0, 'late authoritative data must not take the camera after manual navigation')
})

test('explicit follow centers the actual task immediately and stopping does not move the camera', () => {
  const ui = harness(); const focus = { kind: 'task', workspaceId: 'a', taskId: 'task' }
  ui.render({ projection: project([entry], focus), focus }); ui.initialize()
  ui.render({ followingAgent: true })
  assert.equal(ui.fits.length, 1)
  assert.deepEqual(ui.fits[0].nodes, [{ id: taskNodeId('a', 'task') }])
  assert.equal(ui.fits[0].duration, 0)
  ui.render({ followingAgent: false })
  assert.equal(ui.fits.length, 1)
})
