const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const tick = () => new Promise(done => setImmediate(done))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const invitation = { id: 'invite', workspaceId: 'workspace', workspaceName: 'Pilot', inviterUsername: 'Owner', inviteeEmail: 'member@example.test', status: 'pending', expiresAt: '2026-11-01T00:00:00Z' }

function fixture(overrides = {}) {
  const slots = [], listeners = new Map(), reads = [], notifications = []
  let cursor = 0, effects = [], accepted = 0, acceptedWorkspace
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }] },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback }; return slots[index].callback },
    useEffect(effect, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { slots[index]?.cleanup?.(); slots[index] = { deps }; effects.push(() => { slots[index].cleanup = effect() }) } },
  }
  react.useLayoutEffect = react.useEffect
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@/components/ui/button': { Button: 'Button' }, '@/components/ui/card': { Card: 'Card' }, '@/components/ui/badge': { Badge: 'Badge' },
    'lucide-react': Object.fromEntries(['Bell', 'Check', 'X', 'Users', 'Clock', 'RefreshCw'].map(name => [name, name])),
    '@/hooks/use-notifications': { useNotifications: () => ({ success(...args) { notifications.push(args) }, error(...args) { notifications.push(args) } }) },
    '@/app/actions/invitations': { getUserInvitations: async email => { reads.push(email); return [] }, acceptInvitation: async () => ({ success: true }), declineInvitation: async () => ({ success: true }), ...overrides },
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('components/invitation-notifications.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const window = { addEventListener(name, fn) { listeners.set(name, fn) }, removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name) } }
  new Function('require', 'exports', 'window', source)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, window)
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  return {
    render(userEmail = 'member@example.test') { cursor = 0; const tree = exports.InvitationNotifications({ userEmail, onInvitationAccepted(workspaceId) { accepted++; acceptedWorkspace = workspaceId } }); const pending = effects; effects = []; pending.forEach(effect => effect()); return nodes(tree) },
    focus() { listeners.get('focus')?.() },
    unmount() { slots.forEach(slot => slot.cleanup?.()) },
    listeners, reads, notifications, accepted: () => accepted, acceptedWorkspace: () => acceptedWorkspace,
  }
}
const button = (rows, name) => rows.find(node => node.type === 'Button' && (node.props.children === name || JSON.stringify(node.props.children).includes(name)))

test('empty-workspace invitation inbox stays refreshable and refreshes on window focus', async () => {
  const ui = fixture()
  assert.ok(ui.render().some(node => node.props?.role === 'status'))
  await tick()
  let rows = ui.render()
  assert.ok(JSON.stringify(rows).includes('No pending invitations.'))
  assert.equal(button(rows, 'Refresh invitations').props.disabled, false)
  await button(rows, 'Refresh invitations').props.onClick()
  await tick()
  ui.focus(); await tick(); ui.render()
  assert.deepEqual(ui.reads, ['member@example.test', 'member@example.test', 'member@example.test'])
  ui.unmount()
  assert.equal(ui.listeners.has('focus'), false)
})

test('accept removes the invitation and invalidates an older focus read', async () => {
  const oldRead = deferred(), operation = deferred()
  let reads = 0
  const ui = fixture({ getUserInvitations: async () => ++reads === 1 ? [invitation] : oldRead.promise, acceptInvitation: async id => { assert.equal(id, invitation.id); return operation.promise } })
  ui.render(); await tick()
  ui.focus()
  const pending = button(ui.render(), 'Accept').props.onClick()
  assert.equal(button(ui.render(), 'Decline').props.disabled, true)
  operation.resolve({ success: true }); await pending
  oldRead.resolve([invitation]); await tick()
  assert.equal(ui.accepted(), 1)
  assert.equal(ui.acceptedWorkspace(), 'workspace')
  assert.equal(ui.render().some(node => node.type === 'Card'), false)
  assert.ok(JSON.stringify(ui.render()).includes('No pending invitations.'))
})

test('failed invitation action retains the invitation and offers retry controls', async () => {
  const ui = fixture({ getUserInvitations: async () => [invitation], declineInvitation: async () => ({ error: 'Try again' }) })
  ui.render(); await tick()
  await button(ui.render(), 'Decline').props.onClick()
  const rows = ui.render()
  assert.ok(rows.some(node => node.props?.role === 'alert' && node.props.children === 'Try again'))
  assert.equal(rows.filter(node => node.type === 'Card').length, 1)
  assert.equal(button(rows, 'Decline').props.disabled, false)
})

test('the dashboard mounts the account inbox before the no-workspace creation flow', () => {
  const dashboard = fs.readFileSync('app/dashboard/page.tsx', 'utf8')
  assert.ok(dashboard.indexOf('<InvitationNotifications') < dashboard.indexOf(') : !showWorkspace ?'))
})

for (const action of ['Accept', 'Decline']) test(`${action} from a previous account cannot cancel the new inbox read or notify/navigate`, async () => {
  const operation = deferred(), newRead = deferred()
  const nextInvitation = { ...invitation, id: 'new-invite', workspaceName: 'New account workspace' }
  const ui = fixture({ getUserInvitations: email => email === 'member@example.test' ? Promise.resolve([invitation]) : newRead.promise,
    acceptInvitation: () => operation.promise, declineInvitation: () => operation.promise })
  ui.render(); await tick()
  const pending = button(ui.render(), action).props.onClick()
  ui.render('another@example.test')
  operation.resolve({ success: true }); await pending
  newRead.resolve([nextInvitation]); await tick()
  const rows = ui.render('another@example.test')
  assert.equal(ui.accepted(), 0)
  assert.deepEqual(ui.notifications, [])
  assert.ok(JSON.stringify(rows).includes('New account workspace'))
  assert.equal(button(rows, 'Accept').props.disabled, false)
})

test('a failed invitation action from an unmounted inbox cannot display an error', async () => {
  const operation = deferred()
  const ui = fixture({ getUserInvitations: async () => [invitation], acceptInvitation: () => operation.promise })
  ui.render(); await tick()
  const pending = button(ui.render(), 'Accept').props.onClick()
  ui.unmount()
  operation.resolve({ error: 'Old account failure' }); await pending
  assert.deepEqual(ui.notifications, [])
  assert.equal(ui.accepted(), 0)
})
