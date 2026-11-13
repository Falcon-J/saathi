const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const { createCanvasNavigation, projectCanvas, taskNodeId } = require('../../features/canvas/model.ts')
const { adoptUserNodes, getEdgePosition, ConnectionMode } = require('@xyflow/system')

const workspace = id => ({ id, name: id, timezone: 'UTC', ownerId: 'owner@example.test', ownerUserId: 'owner', members: [], version: 1, targetAt: null, createdAt: '2026-11-12T00:00:00Z' })
const task = { id: 'task', workspaceId: 'a', title: 'Actual task', completed: false, status: 'todo', priority: 'medium', createdBy: 'owner@example.test', createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z', version: 1 }
const navigation = createCanvasNavigation({ actorId: 'actor', canvasId: 'personal' })
const project = (graphs = [], focus = { kind: 'overview' }) => projectCanvas({ graphs, navigation: { ...navigation, focus }, zoom: 1 })
const entry = { workspace: workspace('a'), complete: true, graph: { tasks: [task], dependencies: [], timezone: 'UTC', asOf: '2026-11-12T00:00:00Z' } }

function harness() {
  const slots = [], effects = [], fits = [], opens = []
  let cursor = 0, manual = 0, size = { width: 0, height: 0 }
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
    '@xyflow/react': { ReactFlow: 'ReactFlow', Background: 'Background', Controls: 'Controls', Handle: 'Handle', Position: { Left: 'left', Right: 'right' }, useStore: selector => selector(size) },
    '@xyflow/react/dist/style.css': {}, '@/components/ui/button': { Button: 'Button' },
    '@/features/canvas/model': require('../../features/canvas/model.ts'), '@/lib/task-time': require('../../lib/task-time.ts'), './company-layout': require('./company-layout.ts'), './node-geometry': require('./node-geometry.ts') }
  const code = ts.transpileModule(fs.readFileSync('components/canvas/canvas-flow.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('require', 'exports', 'localStorage', code)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, { getItem: () => null, setItem() {} })
  let props = { projection: project(), cameraKey: 'actor:personal', resources: [], workspaces: [workspace('a'), workspace('b')], focus: { kind: 'overview' }, followingAgent: false,
    onOpen: focus => opens.push(focus), onOpenResource() {}, onZoom() {}, onManualNavigation: () => manual++ }
  return { render(next = {}) { props = { ...props, ...next }; cursor = 0; const tree = exports.default(props); effects.splice(0).forEach(fn => fn()); return tree.props },
    initialize() { this.render().onInit({ fitView: options => { fits.push(options); return Promise.resolve(true) }, setViewport: () => Promise.resolve(true) }); fits.length = 0 }, resize(width, height) { size = { width, height }; return this.render() }, fits, opens, get manual() { return manual } }
}

test('viewport resizing reframes the current task while ordinary live reads preserve deliberate framing', () => {
  const ui = harness(), focus = { kind: 'task', workspaceId: 'a', taskId: 'task' }
  ui.render({ projection: project([entry], focus), focus }); ui.initialize()
  ui.resize(1280, 640); ui.fits.length = 0
  ui.resize(360, 500)
  assert.equal(ui.fits.length, 1)
  assert.deepEqual(ui.fits[0].nodes, [{ id: taskNodeId('a', 'task') }])
  ui.fits.length = 0
  ui.render({ projection: project([entry], focus) })
  assert.equal(ui.fits.length, 0)
})

test('a resize waits for authorized layout readiness and does not follow late data after manual navigation', () => {
  const ui = harness(), focus = { kind: 'task', workspaceId: 'a', taskId: 'task' }
  ui.render({ projection: project([entry], focus), focus, ready: false }); ui.initialize()
  ui.resize(360, 500)
  assert.equal(ui.fits.length, 0)
  ui.render({ ready: true })
  assert.equal(ui.fits.length, 1)
  ui.render({ ready: false }); ui.resize(500, 360)
  ui.render().onMoveStart({ type: 'wheel' })
  ui.render({ ready: true })
  assert.equal(ui.fits.length, 1)
})

test('actual React Flow preserves every connection across immutable refreshes and workspace resizing', () => {
  const ui = harness(), lookup = new Map(), parents = new Map()
  const resources = [{ id: 'section', name: 'Section', organizationId: 'company', parentId: null, kind: 'section', mode: 'restricted', workspaceId: null, version: 1, capabilities: ['read'] },
    { id: 'resource', name: 'A', organizationId: 'company', parentId: 'section', kind: 'workspace', mode: 'inherit', workspaceId: 'a', version: 1, capabilities: ['read'] }]
  const graph = { ...entry, graph: { ...entry.graph, tasks: [task, { ...task, id: 'dependent', title: 'Dependent' }], dependencies: [{ workspaceId: 'a', prerequisiteTaskId: task.id, dependentTaskId: 'dependent' }] } }
  const references = [{ id: 'link', canvasResourceId: 'section', targetResourceId: 'resource' }]
  function positions(flow) {
    const initialized = adoptUserNodes(flow.nodes, lookup, parents)
    assert.equal(initialized.nodesInitialized, true, "Fixed controlled geometry must initialize offscreen nodes so camera fitting can resolve")
    return flow.edges.map(edge => {
      const source = lookup.get(edge.source), target = lookup.get(edge.target)
      const position = getEdgePosition({ id: edge.id, sourceNode: source, targetNode: target, sourceHandle: null, targetHandle: null, connectionMode: ConnectionMode.Strict })
      assert.ok(position, `${edge.id} must have endpoints before DOM measurement and after every controlled refresh`)
      assert.equal(position.sourceX, source.internals.positionAbsolute.x + source.width + 3)
      assert.equal(position.sourceY, source.internals.positionAbsolute.y + source.height / 2)
      assert.equal(position.targetX, target.internals.positionAbsolute.x - 3)
      assert.equal(position.targetY, target.internals.positionAbsolute.y + target.height / 2)
      return position
    })
  }
  const expanded = project([graph], { kind: 'workspace', workspaceId: 'a' })
  const initial = ui.render({ projection: expanded, resources, references })
  assert.equal(initial.edges.length, 2)
  const before = positions(initial)
  const refreshed = ui.render({ projection: project([graph], { kind: 'workspace', workspaceId: 'a' }), resources: resources.map(resource => ({ ...resource })), onOpenResource() {} })
  assert.notEqual(initial.nodes[0], refreshed.nodes[0])
  assert.deepEqual(positions(refreshed), before)
  const resized = ui.render({ projection: project([graph]), resources: resources.map(resource => ({ ...resource })) })
  assert.notEqual(resized.nodes.find(node => node.id === 'workspace:a').height, initial.nodes.find(node => node.id === 'workspace:a').height)
  positions(resized)
})

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

test('the full card opens its canonical record without relying on a scaled-down button', () => {
  const ui = harness()
  const flow = ui.render()
  flow.onNodeClick({}, flow.nodes.find(node => node.id === 'workspace:b'))
  assert.deepEqual(ui.opens, [{ kind: 'workspace', workspaceId: 'b' }])
})

test('dense readiness blocks open the complete canonical group and retain measured focused geometry', () => {
  const ui = harness(), groups = []
  const graph = { ...entry, graph: { ...entry.graph, tasks: Array.from({ length: 100 }, (_, index) => ({ ...task, id: String(index), title: `Task ${index}` })) } }
  const focus = { kind: 'workspace', workspaceId: 'a' }
  const flow = ui.render({ projection: project([graph], focus), focus, onOpenGroup: (...args) => groups.push(args) })
  const visible = flow.nodes.filter(node => !node.hidden)
  const ready = visible.find(node => node.type === 'readiness' && node.data.title === 'Ready')
  assert.ok(ready, 'dense workspace must show readiness blocks instead of a giant task grid')
  assert.equal(ready.data.count, 100)
  assert.match(ready.ariaLabel, /Ready.*100/)
  flow.onNodeClick({}, ready)
  assert.deepEqual(groups, [['a', 'ready']])
  assert.equal(visible.filter(node => node.type === 'task').length, 0)
  assert.deepEqual(ready.measured, { width: ready.width, height: ready.height })
  const focused = { kind: 'task', workspaceId: 'a', taskId: '99' }
  const detail = ui.render({ projection: project([graph], focused), focus: focused })
  const actual = detail.nodes.filter(node => node.type === 'task' && !node.hidden)
  assert.equal(actual.length, 1)
  assert.equal(actual[0].data.title, 'Task 99')
  assert.deepEqual(actual[0].measured, { width: actual[0].width, height: actual[0].height })
  actual[0].data.open()
  assert.deepEqual(ui.opens, [focused])
})
