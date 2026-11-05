const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function fixture(workspaceOverrides = {}, options = {}) {
  const slots = [], listeners = new Map(), pushes = [], removed = []
  let cursor = 0, effects = [], selected = 'workspace', allowDiscard = false
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
    useCallback(callback, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { callback, deps }; return slots[i].callback },
    useEffect(effect, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = effect() }) } },
  }
  react.useLayoutEffect = react.useEffect
  const window = {
    localStorage: options.localStorage ?? { setItem() {} },
    location: { hash: '#workspace-header' },
    addEventListener(name, fn) { listeners.set(name, fn) }, removeEventListener(name) { listeners.delete(name) },
    confirm: () => allowDiscard,
    history: { pushState(_a, _b, hash) { pushes.push(hash); window.location.hash = hash }, replaceState(_a, _b, hash) { window.location.hash = hash } },
  }
  const workspace = { id: 'workspace', name: 'Pilot', members: [], ownerId: 'owner@example.test', timezone: 'UTC' }
  const redirects = []
  const notifications = { info() {}, error() {}, success() {} }, router = { replace(path) { redirects.push(path) }, push() {} }
  const jsx = (type, props) => ({ type, props })
  const source = fs.readFileSync('app/dashboard/page.tsx', 'utf8')
  const parsed = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const dependencies = {}
  // Child components are boundaries; execute the real Dashboard and inspect its contracts.
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const names = statement.importClause?.namedBindings
    dependencies[statement.moduleSpecifier.text] = Object.fromEntries(names?.elements?.map(item => [item.name.text, item.name.text]) ?? [])
  }
  Object.assign(dependencies, {
    '@/lib/draft-storage': { removeDraft(key) { removed.push(key) }, clearAccountDrafts() {} },
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => router },
    '@/hooks/use-notifications': { useNotifications: () => notifications },
    '@/lib/auth-simple': { getSession: async () => ({ email: 'owner@example.test', username: 'Owner' }), logout: async () => options.logoutResult ?? ({ error: 'Unavailable' }) },
    '@/app/actions/capabilities': { getFeatureCapabilities: async () => ({ aiWorkspace: false, csvImport: false }) },
    '@/lib/identity': { normalizeEmail: value => value.toLowerCase() },
    '@/lib/dashboard-state': { getDashboardState: () => 'workspace' },
    '@/lib/dashboard-navigation': { workspaceViewFromHash: hash => ({ '#project-board': 'board', '#team-panel': 'team', '#settings-panel': 'settings' }[hash] ?? 'overview') },
    '@/hooks/use-workspaces': { useWorkspaces: () => ({ workspaces: [workspace, { ...workspace, id: 'other' }], currentWorkspaceId: selected, setCurrentWorkspaceId: id => { selected = id }, tasks: [], realtime: { isConnected: true, eventRevision: 0 }, refreshWorkspaces: async () => {}, refreshTasks: async () => true, ...workspaceOverrides }) },
  })
  const exports = {}
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', 'window', 'navigator', 'sessionStorage', js)(name => dependencies[name], exports, window, { platform: 'Win32', userAgent: '' }, options.sessionStorage ?? { getItem: () => true })
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  return {
    render() { cursor = 0; const tree = exports.default(); const pending = effects; effects = []; pending.forEach(fn => fn()); return nodes(tree) },
    pushes, removed, redirects, selected: () => selected, allowDiscard(value) { allowDiscard = value },
    back(hash) { window.location.hash = hash; listeners.get('hashchange')?.() },
  }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const component = (rows, name) => rows.find(node => node.type === name)

for (const failure of ['read', 'write']) test(`valid session remains usable when welcome storage ${failure} fails`, async () => {
  const ui = fixture({}, { sessionStorage: {
    getItem() { if (failure === 'read') throw new Error('Storage denied'); return null },
    setItem() { throw new Error('Storage denied') },
  } })
  ui.render(); await tick()
  assert.ok(component(ui.render(), 'WorkspaceOverview'))
  assert.deepEqual(ui.redirects, [])
})

test('committed logout redirects even when cross-tab storage notification fails', async () => {
  const ui = fixture({}, { logoutResult: { success: true }, localStorage: { setItem() { throw new Error('Storage denied') } } })
  ui.render(); await tick()
  ui.render().find(node => node.props?.['aria-label'] === 'Logout').props.onSelect()
  await tick()
  assert.deepEqual(ui.redirects, ['/login'])
  assert.equal(ui.render().some(node => node.props?.role === 'alert' && node.props.children === 'Storage denied'), false)
})

test('intentional view navigation creates history entries and browser Back restores view', async () => {
  const ui = fixture(); ui.render(); await tick()
  component(ui.render(), 'DashboardNavigation').props.onOpenBoard()
  assert.equal(component(ui.render(), 'DashboardNavigation').props.activeView, 'board')
  component(ui.render(), 'DashboardNavigation').props.onOpenTeam()
  assert.deepEqual(ui.pushes, ['#project-board', '#team-panel'])
  ui.back('#project-board')
  assert.equal(component(ui.render(), 'DashboardNavigation').props.activeView, 'board')
})

test('dirty quick-add blocks navigation and workspace changes until explicit discard', async () => {
  const ui = fixture(); ui.render(); await tick()
  assert.equal(typeof component(ui.render(), 'WorkspaceOverview').props.onDirtyChange, 'function')
  component(ui.render(), 'WorkspaceOverview').props.onDirtyChange(true)
  component(ui.render(), 'DashboardNavigation').props.onOpenBoard()
  assert.ok(component(ui.render(), 'WorkspaceOverview'))
  component(ui.render(), 'WorkspaceSwitcher').props.onSelectWorkspace('other')
  assert.equal(ui.selected(), 'workspace')
  ui.allowDiscard(true)
  component(ui.render(), 'DashboardNavigation').props.onOpenBoard()
  assert.ok(component(ui.render(), 'WorkspaceBoard'))
})

test('Overview does not load the full dependency view until requested', async () => {
  const ui = fixture(); ui.render(); await tick()
  assert.equal(component(ui.render(), 'NextWorkView'), undefined)
})


test('a failed logout does not clear protection for the still-mounted draft', async () => {
  const ui = fixture(); ui.render(); await tick()
  component(ui.render(), 'WorkspaceOverview').props.onDirtyChange(true)
  ui.allowDiscard(true)
  ui.render().find(node => node.props?.['aria-label'] === 'Logout').props.onSelect()
  await tick(); ui.render()
  ui.allowDiscard(false)
  component(ui.render(), 'DashboardNavigation').props.onOpenBoard()
  assert.ok(component(ui.render(), 'WorkspaceOverview'))
})


test('workspace refresh failure leaves a dirty settings editor mounted', async () => {
  const state = {}
  const ui = fixture(state); ui.render(); await tick()
  ui.back('#settings-panel')
  assert.ok(component(ui.render(), 'WorkspaceSettings'))
  component(ui.render(), 'WorkspaceSettings').props.onDirtyChange(true)
  state.workspaceError = 'Refresh unavailable'
  assert.ok(component(ui.render(), 'WorkspaceSettings'))
})


test('same-tab Help discards confirmed drafts while cancel and new-tab preserve them', async () => {
  const ui = fixture(); ui.render(); await tick()
  component(ui.render(), 'WorkspaceOverview').props.onDirtyChange(true)
  const link = () => ui.render().find(node => node.props?.href === '/guide')
  let prevented = false
  link().props.onClick({ button: 0, preventDefault() { prevented = true } })
  assert.equal(prevented, true); assert.deepEqual(ui.removed, [])
  prevented = false
  link().props.onClick({ button: 0, ctrlKey: true, preventDefault() { prevented = true } })
  assert.equal(prevented, false); assert.deepEqual(ui.removed, [])
  ui.allowDiscard(true)
  link().props.onClick({ button: 0, preventDefault() { throw Error('allowed') } })
  assert.deepEqual(ui.removed, ['saathi:draft:owner@example.test:workspace:quick-add'])
})
