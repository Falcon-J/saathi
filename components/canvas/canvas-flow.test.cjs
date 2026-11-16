const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const { createCanvasNavigation, projectCanvas, taskNodeId } = require('../../features/canvas/model.ts')
const { adoptUserNodes, getEdgePosition, getNodesBounds, getViewportForBounds, ConnectionMode } = require('@xyflow/system')

const workspace = id => ({ id, name: id, timezone: 'UTC', ownerId: 'owner@example.test', ownerUserId: 'owner', members: [], version: 1, targetAt: null, createdAt: '2026-11-12T00:00:00Z' })
const task = { id: 'task', workspaceId: 'a', title: 'Actual task', completed: false, status: 'todo', priority: 'medium', createdBy: 'owner@example.test', createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z', version: 1 }
const navigation = createCanvasNavigation({ actorId: 'actor', canvasId: 'personal' })
const project = (graphs = [], focus = { kind: 'overview' }) => projectCanvas({ graphs, navigation: { ...navigation, focus }, zoom: 1 })
const entry = { workspace: workspace('a'), complete: true, graph: { tasks: [task], dependencies: [], timezone: 'UTC', asOf: '2026-11-12T00:00:00Z' } }

function harness({ savedCamera = null, savedFocus = { kind: 'overview' }, fitResult = () => Promise.resolve(true) } = {}) {
  const slots = [], effects = [], fits = [], opens = [], boundsRequests = [], viewports = [], parents = new Map(), queuedFits = []
  let size = { width: 0, height: 0 }; let ready = false, cursor = 0, manual = 0, renderedNodes = [], committedNodes = new Map(), cameraTree
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i])
  const react = {
    memo: fn => fn,
    useImperativeHandle(ref, create) { ref.current = create() },
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useMemo(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value },
    useCallback(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(fn) } },
  }
  react.useLayoutEffect = react.useEffect
  const jsx = (type, props) => ({ type, props })
  const instance = {
    get viewportInitialized() { return ready },
    getNodesBounds: ids => { boundsRequests.push(ids); return getNodesBounds(ids, { nodeLookup: committedNodes, nodeOrigin: [0, 0] }) },
    fitBounds: (bounds, options) => { fits.push({ bounds, ...options }); return fitResult() },
    setViewport: viewport => { viewports.push(viewport); return Promise.resolve(true) }, zoomIn() {}, zoomOut() {}, zoomTo() {},
  }
  const dependencies = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next-themes': { useTheme: () => ({ resolvedTheme: 'light' }) },
    '@xyflow/react': { getViewportForBounds, useReactFlow: () => instance, useStore: fn => fn({ ...size, transform: [0, 0, 1] }), useOnViewportChange() {}, Panel: 'Panel', ReactFlow: 'ReactFlow', Background: 'Background', Controls: 'Controls', ControlButton: 'ControlButton', Handle: 'Handle', Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' }, useInternalNode: id => committedNodes.get(id) },
    'lucide-react': Object.fromEntries(['Focus','Hand','Maximize2','Minus','MousePointer2','Plus'].map(name => [name, name])),
    '@xyflow/react/dist/style.css': {}, '@/components/ui/button': { Button: 'Button' },
    '@/features/canvas/model': require('../../features/canvas/model.ts'), '@/lib/task-time': require('../../lib/task-time.ts'), './company-layout': require('./company-layout.ts'), './node-geometry': require('./node-geometry.ts'), './camera-utils': { ...require('./camera-utils.ts'), readCanvasCamera: (key, focusKey) => require('./camera-utils.ts').readCanvasCamera(key, focusKey, { getItem: () => JSON.stringify(savedCamera && { ...savedCamera, focusKey: JSON.stringify(savedFocus) }) }) }, './canvas-camera': { CanvasCamera: 'CanvasCamera' } }
  const code = ts.transpileModule(fs.readFileSync('components/canvas/canvas-flow.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('require', 'exports', 'localStorage', code)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, { getItem: () => JSON.stringify(savedCamera), setItem() {} })
  const cameraCode = ts.transpileModule(fs.readFileSync('components/canvas/canvas-camera.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const cameraExports = {}
  new Function('require', 'exports', 'localStorage', cameraCode)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, cameraExports, { getItem: () => JSON.stringify(savedCamera), setItem() {} })
  let props = { projection: project(), cameraKey: 'actor:personal', resources: [], workspaces: [workspace('a'), workspace('b')], focus: { kind: 'overview' }, followingAgent: false,
    onOpen: focus => opens.push(focus), onOpenResource() {}, onZoom() {}, onViewportWidthChange() {}, onManualNavigation: () => manual++ }
  return { render(next = {}) { props = { ...props, ...next }; cursor = 0; const tree = exports.default(props); renderedNodes = tree.props.nodes; const camera = tree.props.children.find(child => child?.type === 'CanvasCamera'); cameraTree=cameraExports.CanvasCamera(camera.props); effects.splice(0).forEach(fn => fn()); return tree.props }, get cameraTree(){return cameraTree},
    resize(width, height) { size = { width, height }; this.commit(); return this.render() }, commit() { adoptUserNodes(renderedNodes, committedNodes, parents) },
    initialize() { this.render(); this.commit(); ready = true; fits.length = 0 }, measure() { queuedFits.splice(0).forEach(fit => fit()) }, fits, opens, boundsRequests, viewports, get manual() { return manual } }
}

test('actual React Flow preserves every connection across immutable refreshes and workspace resizing', () => {
  const ui = harness(), lookup = new Map(), parents = new Map()
  const resources = [{ id: 'section', name: 'Section', organizationId: 'company', parentId: null, kind: 'section', mode: 'restricted', workspaceId: null, version: 1, capabilities: ['read'] },
    { id: 'resource', name: 'A', organizationId: 'company', parentId: 'section', kind: 'workspace', mode: 'inherit', workspaceId: 'a', version: 1, capabilities: ['read'] }]
  const graph = { ...entry, graph: { ...entry.graph, tasks: [task, { ...task, id: 'dependent', title: 'Dependent' }], dependencies: [{ workspaceId: 'a', prerequisiteTaskId: task.id, dependentTaskId: 'dependent' }] } }
  const references = [{ id: 'link', canvasResourceId: 'section', targetResourceId: 'resource' }]
  function positions(flow) {
    adoptUserNodes(flow.nodes, lookup, parents)
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
  assert.deepEqual(ui.boundsRequests.at(-1), [taskNodeId('a', 'task')])
  assert.equal(ui.fits[0].duration, 0)
  ui.render({ followingAgent: false })
  assert.equal(ui.fits.length, 1)
})

test('opening a collapsed task waits for React Flow to commit its visible geometry before fitting', () => {
  const ui = harness(), focus = { kind: 'task', workspaceId: 'a', taskId: 'task' }
  ui.render({ projection: project([entry]) }); ui.initialize()
  ui.render({ projection: project([entry], focus), focus })
  assert.equal(ui.fits.length, 0, 'the old hidden task cannot satisfy a new focus request')
  ui.commit(); ui.render()
  assert.equal(ui.fits.length, 1)
  assert.deepEqual(ui.boundsRequests.at(-1), [taskNodeId('a', 'task')])
})

test('workspace expansion cannot fit the previous collapsed workspace geometry', () => {
  const ui = harness(), focus = { kind: 'workspace', workspaceId: 'a' }
  ui.render({ projection: project([entry]) }); ui.initialize()
  ui.render({ projection: project([entry], focus), focus })
  assert.equal(ui.fits.length, 0)
  ui.commit(); ui.render()
  assert.equal(ui.fits.length, 1)
  assert.deepEqual(ui.boundsRequests.at(-1), ['workspace:a'])
})

test('a task selected before the renderer mounts is focused after initialization', () => {
  const ui = harness(), focus = { kind: 'task', workspaceId: 'a', taskId: 'task' }
  ui.render({ projection: project([entry], focus), focus }); ui.initialize(); ui.render()
  assert.equal(ui.fits.length, 1)
  assert.deepEqual(ui.boundsRequests.at(-1), [taskNodeId('a', 'task')])
})

test('late node measurement cannot replay an overview fit after explicit focus or manual pan', () => {
  const ui = harness(), focus = { kind: 'task', workspaceId: 'a', taskId: 'task' }
  ui.render({ projection: project([entry]) }); ui.initialize()
  let flow = ui.render({ projection: project([entry], focus), focus })
  ui.commit(); flow = ui.render()
  assert.equal(ui.fits.length, 1)
  flow.onMoveStart({ type: 'wheel' })
  ui.measure()
  assert.equal(ui.fits.length, 1, 'an earlier overview queue must not overwrite the current camera')
  assert.equal(flow.fitView, false)
  assert.ok(flow.children.find(node => node?.type === 'CanvasCamera'))
})


test('stopping follow invalidates an earlier failed asynchronous camera request', async () => {
  let rejectFit
  const ui = harness({ fitResult: () => new Promise((_resolve, reject) => { rejectFit = reject }) })
  const focus = { kind: 'task', workspaceId: 'a', taskId: 'task' }
  ui.render({ projection: project([entry], focus), focus, followingAgent: true }); ui.initialize(); ui.render()
  assert.equal(ui.fits.length, 1)
  ui.render({ followingAgent: false })
  rejectFit(new Error('viewport unavailable')); await Promise.resolve(); await Promise.resolve()
  ui.render({ projection: project([entry], focus) }); ui.commit(); ui.render()
  assert.equal(ui.fits.length, 1, 'cancelled follow must not be restored by a late rejection')
})

test('manual navigation before initial records are adopted prevents late saved camera restoration', () => {
  const ui = harness({ savedCamera: { x: 20, y: 30, zoom: .5 } })
  const initial = ui.render()
  initial.onMoveStart({ type: 'wheel' })
  ui.initialize(); ui.render()
  assert.deepEqual(ui.viewports, [])
})

test('Excalidraw-style tools preserve editing keystrokes and use H and V for canvas navigation', () => {
  const ui = harness(); let flow = ui.render()
  const key = (value, tagName = 'DIV') => ({ key: value, target: { tagName }, preventDefault() {} })
  flow.onKeyDownCapture(key('h', 'INPUT')); flow = ui.render()
  assert.deepEqual(flow.panOnDrag, [1, 2])
  flow.onKeyDownCapture(key('h')); flow = ui.render()
  assert.equal(flow.panOnDrag, true)
  assert.equal(flow.selectionOnDrag, false)
  flow.onKeyDownCapture(key('v')); flow = ui.render()
  assert.deepEqual(flow.panOnDrag, [1, 2])
  assert.equal(flow.selectionOnDrag, true)
  assert.equal(flow.panActivationKeyCode, 'Space')
  assert.equal(flow.panOnScroll, true)
  assert.equal(flow.zoomOnScroll, false)
})

test('zoom labels remain useful at a large-canvas overview scale', () => {
  const { formatCanvasZoom } = require('./camera-utils.ts')
  assert.equal(formatCanvasZoom(.002), '0.2%')
  assert.equal(formatCanvasZoom(.55), '55%')
  assert.equal(formatCanvasZoom(1), '100%')
  assert.equal(formatCanvasZoom(NaN), String.fromCharCode(8212))
})


test('selection changes stay local while dimension and position changes cannot rewrite canonical layout', () => {
  const ui = harness(), focus = { kind: 'workspace', workspaceId: 'a' }
  const first = ui.render({ projection: project([entry], focus), focus })
  const id = taskNodeId('a', 'task'), original = first.nodes.find(node => node.id === id)
  first.onNodesChange([{ id, type: 'select', selected: true }, { id, type: 'position', position: { x: 999, y: 999 } }])
  const selected = ui.render().nodes.find(node => node.id === id)
  assert.equal(selected.selected, true)
  assert.deepEqual(selected.position, original.position)
  assert.equal(selected.data, original.data, 'selection must not rebuild task content')
  ui.render().onNodesChange([{ id, type: 'select', selected: false }])
  assert.equal(Boolean(ui.render().nodes.find(node => node.id === id).selected), false)
})

test('record titles open canonical work while the card remains selectable', () => {
  const ui = harness(), flow = ui.render()
  const record = flow.nodeTypes.workspace({ data: flow.nodes[0].data })
  const visit = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(visit)]
  const heading = visit(record).find(node => node?.type === 'h2')
  const title = visit(heading).find(node => node?.type === 'button')
  assert.ok(title, 'the title must support pointer and keyboard activation')
  let stopped = false
  title.props.onClick({ stopPropagation() { stopped = true } })
  assert.equal(stopped, true)
  assert.deepEqual(ui.opens, [{ kind: 'workspace', workspaceId: 'a' }])
  assert.equal(flow.onNodeClick, undefined, 'selecting the rest of a card must not open it')
})

test('relationship cards retain task identity and focus the nearby dependency context',()=>{
 const ui=harness(),focus={kind:'task',workspaceId:'a',taskId:'task'}
 const graph={...entry,graph:{...entry.graph,tasks:[{...task,id:'before',title:'Before'},task,{...task,id:'after',title:'After'}],dependencies:[{workspaceId:'a',prerequisiteTaskId:'before',dependentTaskId:'task'},{workspaceId:'a',prerequisiteTaskId:'task',dependentTaskId:'after'}]}}
 const flow=ui.render({projection:projectCanvas({graphs:[graph],navigation:{...navigation,focus},zoom:1,relationships:true}),focus})
 const selected=flow.nodes.find(n=>n.id===taskNodeId('a','task'))
 assert.equal(selected.data.relationship,true)
 ui.initialize();ui.resize(1000,700);ui.commit();ui.render()
 assert.deepEqual(new Set(ui.boundsRequests.at(-1)),new Set(['before','task'].map(id=>taskNodeId('a',id))))
})


test('camera preferences cannot restore a deep task position into a collapsed or different authorized view', () => {
  const { readCanvasCamera } = require('./camera-utils.ts')
  const taskKey = JSON.stringify({ kind: 'task', workspaceId: 'a', taskId: 'task' })
  const saved = { x: -1000, y: -80000, zoom: 2, focusKey: taskKey }
  const storage = { getItem: () => JSON.stringify(saved) }
  assert.deepEqual(readCanvasCamera('scope', taskKey, storage), { x: -1000, y: -80000, zoom: 2 })
  assert.equal(readCanvasCamera('scope', JSON.stringify({ kind: 'overview' }), storage), null)
  assert.equal(readCanvasCamera('scope', taskKey, { getItem: () => '{"x":0,"y":0,"zoom":1}' }), null)
})


test('camera restoration preserves the world center when the viewport changes from desktop to mobile', () => {
  const { restoreCanvasCamera } = require('./camera-utils.ts')
  const saved = { x: -100, y: -2000, zoom: 1, canvasWidth: 1280, canvasHeight: 700 }
  const mobile = restoreCanvasCamera(saved, 360, 600)
  assert.equal((360 / 2 - mobile.x) / mobile.zoom, (1280 / 2 - saved.x) / saved.zoom)
  assert.equal((600 / 2 - mobile.y) / mobile.zoom, (700 / 2 - saved.y) / saved.zoom)
})



test('updated event handlers do not rebuild graph records and existing Open controls use the latest handler', () => {
  const ui = harness(), calls = [], projection = project([entry])
  const first = ui.render({ projection, onOpen: () => calls.push('old') })
  const second = ui.render({ onOpen: () => calls.push('current') })
  assert.equal(second.nodes, first.nodes)
  first.nodes[0].data.open()
  assert.deepEqual(calls, ['current'])
})

test('responsive width is reported by the isolated camera without rebuilding graph records',()=>{const ui=harness(),widths=[];ui.render({onViewportWidthChange:w=>widths.push(w)});ui.resize(360,500);assert.deepEqual(widths,[360]);ui.resize(360,300);assert.deepEqual(widths,[360]);ui.resize(1280,500);assert.deepEqual(widths,[360,1280])})
test('viewport resize reframes focused work after the authorized node layout commits',()=>{const ui=harness(),focus={kind:'task',workspaceId:'a',taskId:'task'};ui.render({projection:project([entry],focus),focus});ui.initialize();ui.resize(1280,700);ui.fits.length=0;ui.resize(360,500);assert.equal(ui.fits.length,1);assert.deepEqual(ui.boundsRequests.at(-1),[taskNodeId('a','task')]);ui.fits.length=0;ui.render({projection:project([entry],focus)});assert.equal(ui.fits.length,0)})

test('company resource focus frames its canonical container instead of the full canvas',()=>{const ui=harness();const resource={id:'section',name:'Section',organizationId:'company',parentId:null,kind:'section',mode:'restricted',workspaceId:null,version:1,capabilities:['read']};ui.render({resources:[resource],focus:{kind:'resource',resourceId:'section'}});ui.initialize();ui.render();assert.deepEqual(ui.boundsRequests.at(-1),[require('./company-layout.ts').containerNodeId('section')])})

test('new focused work restores geometry fitting after earlier manual navigation',()=>{const ui=harness(),focus={kind:'task',workspaceId:'a',taskId:'task'};ui.render({projection:project([entry])});ui.initialize();ui.render().onPointerDownCapture();ui.render({projection:project([entry],focus),focus});ui.commit();ui.render();ui.fits.length=0;const changed=project([entry],focus);changed.nodes=changed.nodes.map(n=>n.kind==='task'?{...n,width:n.width+100}:n);ui.render({projection:changed});ui.commit();ui.render();assert.equal(ui.fits.length,1);assert.deepEqual(ui.boundsRequests.at(-1),[taskNodeId('a','task')])})

test('saved focused camera waits for authorized URL resolution instead of restoring overview',()=>{const focus={kind:'workspace',workspaceId:'a'},savedCamera={x:12,y:34,zoom:.37};const ui=harness({savedCamera,savedFocus:focus});ui.render({projection:project([entry]),restoreReady:false});ui.initialize();ui.render();assert.equal(ui.viewports.length,0);ui.render({projection:project([entry],focus),focus,restoreReady:true});ui.commit();ui.render();assert.deepEqual(ui.viewports.at(-1),savedCamera)})

test('resizing waits for the responsive projection before fitting a manually framed task',()=>{const ui=harness(),focus={kind:'task',workspaceId:'a',taskId:'task'},graph={...entry,graph:{...entry.graph,tasks:[task,...['a','b','c'].map(id=>({...task,id}))]}};const projectFor=compact=>projectCanvas({graphs:[graph],navigation:{...navigation,focus},zoom:1,compact});ui.render({projection:projectFor(true),focus,compact:true});ui.initialize();ui.resize(360,708);ui.render().onPointerDownCapture();ui.fits.length=0;ui.resize(800,168);assert.equal(ui.fits.length,0,'old compact positions must not be framed in the landscape viewport');ui.render({projection:projectFor(false),compact:false});ui.commit();ui.render();assert.equal(ui.fits.length,1);assert.deepEqual(ui.boundsRequests.at(-1),[taskNodeId('a','task')])})

test('restoring a focused camera across a responsive breakpoint frames the new canonical layout',()=>{const focus={kind:'task',workspaceId:'a',taskId:'task'},ui=harness({savedCamera:{x:100,y:100,zoom:1,canvasWidth:1280,canvasHeight:708},savedFocus:focus});ui.render({projection:projectCanvas({graphs:[entry],navigation:{...navigation,focus},zoom:1,compact:true}),focus,compact:true});ui.initialize();ui.resize(360,708);ui.commit();ui.render();assert.equal(ui.viewports.length,0,'desktop positions must not restore into a different mobile layout');assert.ok(ui.fits.length>0)})

test('relationship edges use the same vertical handles before and after refresh',()=>{
const focus={kind:'task',workspaceId:'a',taskId:'task'},graph={...entry,graph:{...entry.graph,tasks:[task,{...task,id:'before'}],dependencies:[{workspaceId:'a',prerequisiteTaskId:'before',dependentTaskId:'task'}]}};
const ui=harness(),lookup=new Map(),parents=new Map();
for(let i=0;i<2;i++){
const flow=ui.render({projection:projectCanvas({graphs:[graph],navigation:{...navigation,focus},zoom:1,relationships:true}),focus});
adoptUserNodes(flow.nodes,lookup,parents);
const edge=flow.edges.find(e=>!e.hidden),source=lookup.get(edge.source),target=lookup.get(edge.target);
const pos=getEdgePosition({id:edge.id,sourceNode:source,targetNode:target,sourceHandle:null,targetHandle:null,connectionMode:ConnectionMode.Strict});
assert.equal(pos.sourceX,source.internals.positionAbsolute.x+source.width/2);assert.equal(pos.sourceY,source.internals.positionAbsolute.y+source.height+3);
assert.equal(pos.targetX,target.internals.positionAbsolute.x+target.width/2);assert.equal(pos.targetY,target.internals.positionAbsolute.y-3);
}
})

test('relationship framing includes both desktop prerequisites, prioritizes the unfinished phone blocker and never enlarges automatic cards',()=>{
const focus={kind:'task',workspaceId:'a',taskId:'task'},graph={...entry,graph:{...entry.graph,tasks:[{...task,id:'done',completed:true,status:'done'},{...task,id:'blocker'},task],dependencies:[{workspaceId:'a',prerequisiteTaskId:'done',dependentTaskId:'task'},{workspaceId:'a',prerequisiteTaskId:'blocker',dependentTaskId:'task'}]}};
for(const compact of [false,true]){
const ui=harness();ui.render({projection:projectCanvas({graphs:[graph],navigation:{...navigation,focus},zoom:1,relationships:true,compact}),focus,compact});ui.initialize();ui.resize(compact?360:896,compact?440:836);
assert.deepEqual(ui.boundsRequests.at(-1),['blocker','task'].map(id=>taskNodeId('a',id)));
assert.ok(ui.viewports.at(-1)?.zoom<=1,'Automatic relationship fitting must retain readable normal card sizing');
}
})

test('task focus removes workspace card chrome and unrelated hierarchy without changing navigation elsewhere',()=>{
 const ui=harness(),focus={kind:'task',workspaceId:'a',taskId:'task'};
 const flow=ui.render({projection:projectCanvas({graphs:[entry],navigation:{...navigation,focus},zoom:1,relationships:true}),focus});
 assert.deepEqual(flow.nodes.filter(n=>n.type!=='task').map(n=>n.id),['workspace:a']);
 const group=flow.nodes.find(n=>n.id==='workspace:a');assert.equal(group.focusable,false);assert.equal(group.ariaLabel,undefined);assert.equal(flow.nodeTypes.workspace({data:group.data}),null);
 const selected=flow.nodes.find(n=>n.id===taskNodeId('a','task'));assert.equal(selected.data.focused,true);
})

test('manual Fit View frames only visible task content and excludes its invisible structural group',()=>{
 const ui=harness(),focus={kind:'task',workspaceId:'a',taskId:'task'},graph={...entry,graph:{...entry.graph,tasks:[{...task,id:'before'},task],dependencies:[{workspaceId:'a',prerequisiteTaskId:'before',dependentTaskId:'task'}]}};
 ui.render({projection:projectCanvas({graphs:[graph],navigation:{...navigation,focus},zoom:1,relationships:true}),focus});ui.initialize();ui.resize(1000,700);
 const visit=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(visit):[n,...visit(n.props?.children)];
 visit(ui.cameraTree).find(n=>n.props?.['aria-label']==='Fit View').props.onClick();
 assert.deepEqual(new Set(ui.boundsRequests.at(-1)),new Set(['before','task'].map(id=>taskNodeId('a',id))));
})
