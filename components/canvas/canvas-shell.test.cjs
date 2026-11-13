const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
function harness(options = {}) {
  const slots = [], effects = [], calls = []
  let cursor = 0, tree
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i])
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useMemo(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value },
    useCallback(fn, deps) { return this.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(fn) } },
  }
  react.useLayoutEffect = react.useEffect
  // Hook functions are destructured by compiled React components.
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps)
  const store = { workspaces: [], currentWorkspaceId: null, loading: false, workspaceError: null, realtime: { eventRevision: 0 }, refreshWorkspaces: async () => calls.push('refresh-workspaces'), setCurrentWorkspaceId: id => { store.currentWorkspaceId = id; calls.push(['workspace', id]) }, ...options.store }
  const graph = { entry: null, error: null, loading: false, reload: async () => true, ...options.graph }
  const companies = { resources: [], references: [], error: null, loading: false, reload: async () => calls.push('refresh-companies'), ...options.companies }
  const jsx = (type, props) => ({ type, props })
  const deps = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/dynamic': { default: () => 'CanvasFlow' }, 'next/link': { default: 'Link' }, '@xyflow/react': { ReactFlowProvider: 'ReactFlowProvider' },
    'lucide-react': Object.fromEntries(['ArrowLeft', 'Building2', 'List', 'Plus', 'RefreshCw', 'X'].map(key => [key, key])),
    '@/hooks/use-workspaces': { useWorkspaces: () => store }, '@/hooks/use-canvas-graph': { useCanvasGraph: () => graph }, './use-canvas-resources': { useCanvasResources: () => companies },
    '@/features/canvas/model': require('../../features/canvas/model.ts'), '@/lib/identity': require('../../lib/identity.ts'), '@/lib/mutation-result': require('../../lib/mutation-result.ts'), '@/lib/task-permission': require('../../lib/task-permission.ts'), '@/lib/capability-ceiling': require('../../lib/capability-ceiling.ts'), '@/features/access/contracts': { ACCESS_CAPABILITIES: ['read', 'create', 'edit', 'comment', 'manage', 'delete'] },
    '@/app/tasks/actions': { toggleTask() {} }, '@/app/actions/workspaces': { archiveWorkspace() {}, deleteWorkspace() {}, transferWorkspaceOwnership() {} },
  }
  for (const [path, exports] of Object.entries({ '@/components/workspace-board': ['WorkspaceBoard'], '@/components/workspace-create-form': ['WorkspaceCreateForm'], '@/components/next-work-view': ['NextWorkView'], '@/components/member-manager': ['MemberManager'], '@/components/workspace-settings': ['WorkspaceSettings'], '@/components/activity-history': ['ActivityHistory'], '@/components/ui/button': ['Button'], '@/components/ui/dialog': ['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle'], './canvas-command-bar': ['CanvasCommandBar'], './company-panel': ['CompanyPanel'], './agent-activity': ['AgentActivity'] })) deps[path] = Object.fromEntries(exports.map(key => [key, key]))
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync('components/canvas/canvas-shell.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', 'window', code)(name => { assert.ok(name in deps, name); return deps[name] }, exports, { confirm: () => true, addEventListener() {}, removeEventListener() {} })
  return { render() { cursor = 0; tree = exports.CanvasShell({ actorId: 'actor', email: 'actor@example.test' }); effects.splice(0).forEach(fn => fn()); return nodes(tree) }, text() { return JSON.stringify(tree) }, store, graph, companies, calls }
}

test('company loading cannot masquerade as an empty account', () => {
  const ui = harness({ companies: { loading: true } })
  const result = ui.render()
  assert.equal(result.some(n => n.type === 'h2' && n.props.children === 'Create a workspace'), false)
  assert.match(ui.text(), /Loading compan/)
})

test('failed company reads expose recovery in the main canvas rather than an empty creation state', async () => {
  const ui = harness({ companies: { error: 'Company access unavailable' } })
  const result = ui.render()
  assert.equal(result.some(n => n.type === 'h2' && n.props.children === 'Create a workspace'), false)
  const mainAlert = result.find(n => n.props?.role === 'alert' && nodes(n).some(c => c.props?.children === 'Company access unavailable'))
  assert.ok(mainAlert)
  const retry = nodes(mainAlert).find(n => n.type === 'Button')
  await retry.props.onClick()
  assert.ok(ui.calls.includes('refresh-companies'))
})

module.exports = { harness, nodes }
