const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const jsx = (type, props) => ({ type, props })
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)]
const token = 'a'.repeat(43)
function fixture(file, name, props, actions = {}, stored = new Map()) {
  const slots = [], effects = [], cleanups = [], routes = []; let cursor = 0
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value }] },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
    useEffect(effect) { const i = cursor++; if (!slots[i]) { slots[i] = {}; effects.push(effect) } },
  }
  const listeners = new Map()
  const window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), location: { hash: `#token=${token}`, origin: 'https://app.test', replace(path) { routes.push(path) } }, history: { replaceState(_a, _b, path) { assert.equal(path, '/join'); window.location.hash = '' } } }
  const sessionStorage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }
  const deps = { '@/lib/supabase/config': { getAuthCallbackUrl: () => 'https://app.test/auth/callback' }, react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'Link' }, 'next/navigation': { useRouter: () => ({ replace(path) { routes.push(path) }, refresh() {} }) }, '@/app/actions/invitations': actions, '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' } }
  const result = {}
  new Function('require', 'exports', 'window', 'sessionStorage', 'navigator', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(key => { assert.ok(key in deps, key); return deps[key] }, result, window, sessionStorage, { clipboard: { writeText: async () => { throw Error('denied') } } })
  const draw = () => { cursor = 0; return nodes(result[name](props)) }
  return { draw, routes, window, stored, hash(value) { window.location.hash = value; listeners.get('hashchange')?.() }, mount() { draw(); effects.splice(0).forEach(effect => cleanups.push(effect())); return draw() }, update(next) { Object.assign(props, next); return draw() }, unmount() { cleanups.forEach(cleanup => cleanup?.()) } }
}
const preview = { workspaceName: 'Pilot', inviterUsername: 'Owner', expiresAt: '2026-12-01' }
test('signed-out link preserves token only in session storage and auth redirects exclude it', async () => {
  const ui = fixture('components/join-invitation.tsx', 'JoinInvitation', { signedIn: false }, { getInvitationLinkPreview: async () => preview })
  ui.mount(); await tick(); const rows = ui.draw()
  for (const route of ['/login?redirect=%2Fjoin', '/register?redirect=%2Fjoin']) assert.ok(rows.some(node => node.type === 'Link' && node.props.href === route))
  assert.equal(ui.window.location.hash, ''); assert.equal(ui.stored.get('saathi:join-token'), token)
  assert.equal(rows.some(node => node.props?.href?.includes(token)), false)
})
test('signup return restores pending token and waits for explicit join before accepting', async () => {
  let accepted = 0
  const stored = new Map([['saathi:join-token', token]])
  const ui = fixture('components/join-invitation.tsx', 'JoinInvitation', { signedIn: true }, { getInvitationLinkPreview: async value => { assert.equal(value, token); return preview }, acceptInvitationLink: async value => { assert.equal(value, token); accepted++; return { success: true, workspaceId: 'workspace' } } }, stored)
  ui.window.location.hash = ''; ui.mount(); await tick(); assert.equal(accepted, 0)
  await ui.draw().find(node => node.type === 'Button' && node.props.children === 'Join workspace').props.onClick()
  assert.equal(accepted, 1); assert.equal(stored.size, 0); assert.deepEqual(ui.routes, ['/dashboard?workspace=workspace'])
})
test('expired link offers new-link guidance without a join control', async () => {
  const ui = fixture('components/join-invitation.tsx', 'JoinInvitation', { signedIn: true }, { getInvitationLinkPreview: async () => null })
  ui.mount(); await tick(); assert.match(JSON.stringify(ui.draw()), /new link/); assert.equal(ui.draw().some(node => node.props?.children === 'Join workspace'), false)
})
test('owner creates a link without email and can manually copy after clipboard failure', async () => {
  const calls = []
  const ui = fixture('components/invitation-link-creator.tsx', 'InvitationLinkCreator', { workspaceId: 'workspace', onCreated: async () => {} }, { createWorkspaceInvitationLink: async (...args) => { calls.push(args); return { success: true, token } } })
  ui.mount(); await ui.draw().find(node => node.type === 'Button').props.onClick()
  assert.deepEqual(calls, [['workspace']]); const input = ui.draw().find(node => node.type === 'Input'); assert.equal(input.props.value, `https://app.test/join#token=${token}`)
  await ui.draw().find(node => node.props?.children === 'Copy invite link').props.onClick()
  assert.ok(ui.draw().some(node => node.props?.role === 'alert')); assert.equal(ui.draw().find(node => node.type === 'Input').props.value, input.props.value)
})
test('malformed fragment cannot fall back to a stale invitation token', async () => {
  let calls = 0
  const ui = fixture('components/join-invitation.tsx', 'JoinInvitation', { signedIn: true }, { getInvitationLinkPreview: async () => { calls++; return preview } }, new Map([['saathi:join-token', token]]))
  ui.window.location.hash = '#token='; ui.mount(); await tick()
  assert.equal(calls, 0); assert.equal(ui.stored.size, 0)
})
test('duplicate acceptance is guarded and late completion after unmount does not navigate', async () => {
  let calls = 0, resolve
  const ui = fixture('components/join-invitation.tsx', 'JoinInvitation', { signedIn: true }, { getInvitationLinkPreview: async () => preview, acceptInvitationLink: () => { calls++; return new Promise(done => { resolve = done }) } })
  ui.mount(); await tick()
  const join = ui.draw().find(node => node.props?.children === 'Join workspace').props.onClick
  const first = join(); await join(); assert.equal(calls, 1)
  ui.unmount(); resolve({ success: true, workspaceId: 'workspace' }); await first
  assert.deepEqual(ui.routes, [])
})
test('cancel removes the retained invitation token', async () => {
  const ui = fixture('components/join-invitation.tsx', 'JoinInvitation', { signedIn: false }, { getInvitationLinkPreview: async () => preview })
  ui.mount(); await tick(); ui.draw().find(node => node.props?.children === 'Go to dashboard').props.onClick()
  assert.equal(ui.stored.size, 0)
})

test('new same-tab link resets state and stale preview cannot replace it', async()=>{
 let resolveOld
 const next='b'.repeat(43)
 const ui=fixture('components/join-invitation.tsx','JoinInvitation',{signedIn:true},{getInvitationLinkPreview:value=>value===token?new Promise(done=>{resolveOld=done}):Promise.resolve({...preview,workspaceName:'New workspace'})})
 ui.mount();ui.hash('#token='+next);await tick()
 assert.match(JSON.stringify(ui.draw()),/New workspace/)
 resolveOld(null);await tick()
 assert.match(JSON.stringify(ui.draw()),/New workspace/);assert.equal(ui.stored.get('saathi:join-token'),next)
})
test('new link invalidates an older acceptance completion',async()=>{
 let resolveAccept
 const next='b'.repeat(43)
 const ui=fixture('components/join-invitation.tsx','JoinInvitation',{signedIn:true},{getInvitationLinkPreview:async()=>preview,acceptInvitationLink:()=>new Promise(done=>{resolveAccept=done})})
 ui.mount();await tick();const first=ui.draw().find(node=>node.props?.children==='Join workspace').props.onClick()
 ui.hash('#token='+next);await tick();resolveAccept({success:true,workspaceId:'old'});await first
 assert.deepEqual(ui.routes,[]);assert.equal(ui.stored.get('saathi:join-token'),next)
})

test('alias join redirects to canonical origin with fragment before touching storage or preview',async()=>{
 let reads=0
 const ui=fixture('components/join-invitation.tsx','JoinInvitation',{signedIn:false},{getInvitationLinkPreview:async()=>{reads++;return preview}})
 ui.window.location.origin='https://alias.test';ui.mount();await tick()
 assert.deepEqual(ui.routes,['https://app.test/join#token='+token]);assert.equal(ui.stored.size,0);assert.equal(reads,0)
})
test('owner links always use the canonical auth origin',async()=>{
 const ui=fixture('components/invitation-link-creator.tsx','InvitationLinkCreator',{workspaceId:'workspace',onCreated:async()=>{}},{createWorkspaceInvitationLink:async()=>({success:true,token})})
 ui.window.location.origin='https://alias.test';ui.mount();await ui.draw().find(node=>node.type==='Button').props.onClick()
 assert.equal(ui.draw().find(node=>node.type==='Input').props.value,'https://app.test/join#token='+token)
})

test('revoking the displayed invite removes its copy control without hiding a different invite', async () => {
 const ui=fixture('components/invitation-link-creator.tsx','InvitationLinkCreator',{workspaceId:'workspace',onCreated:async()=>{},revokedInvitationIds:[]},{createWorkspaceInvitationLink:async()=>({success:true,token,invitation:{id:'current'}})})
 ui.mount();await ui.draw().find(node=>node.type==='Button').props.onClick()
 assert.ok(ui.draw().some(node=>node.props?.children==='Copy invite link'))
 ui.update({revokedInvitationIds:['another']})
 assert.ok(ui.draw().some(node=>node.props?.children==='Copy invite link'))
 ui.update({revokedInvitationIds:['another','current']})
 assert.equal(ui.draw().some(node=>node.props?.children==='Copy invite link'),false)
 assert.equal(ui.draw().some(node=>node.type==='Input'),false)
})
