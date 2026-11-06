const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const jsx = (type, props) => ({ type, props })
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)]
function load(file, deps) {
  const result = {}
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(key => { assert.ok(key in deps, key); return deps[key] }, result)
  return result
}
function fixture(actions, callback = true) {
  const slots = [], effects = [], cleanups = []; let cursor = 0, verified = 0, refreshed = 0
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value }] },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
    useEffect(effect) { const i = cursor++; if (!slots[i]) { slots[i] = {}; effects.push(effect) } },
  }
  const component = load('components/invitation-email-verification.tsx', { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/navigation': { useRouter: () => ({ refresh() { refreshed++ } }) }, '@/app/actions/invitations': actions, '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' } })
  const draw = () => { cursor = 0; return nodes(component.InvitationEmailVerification({ onVerified: callback ? () => { verified++ } : undefined })) }
  return { draw, mount() { draw(); effects.splice(0).forEach(effect => cleanups.push(effect())); return draw() }, unmount() { cleanups.forEach(cleanup => cleanup?.()) }, verified: () => verified, refreshed: () => refreshed,
    send() { return draw().find(node => node.type === 'Button' && node.props.type === 'button').props.onClick() },
    submit() { draw().find(node => node.type === 'Input').props.onChange({ target: { value: '123456' } }); return draw().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }) },
  }
}
test('verification guards hydration, sends no email argument, and confirms only the code', async () => {
  const requests = [], codes = []
  const ui = fixture({ requestInvitationVerification: async (...args) => { requests.push(args); return { success: true } }, confirmInvitationVerification: async (...args) => { codes.push(args); return { success: true } } })
  assert.ok(ui.draw().filter(node => ['Input', 'Button'].includes(node.type)).every(node => node.props.disabled))
  ui.send(); await tick(); assert.equal(requests.length, 0)
  ui.mount(); ui.send(); await tick(); assert.deepEqual(requests, [[]])
  ui.submit(); await tick(); assert.deepEqual(codes, [['123456']]); assert.equal(ui.verified(), 1)
})
test('expired and rate-limited codes remain recoverable', async () => {
  const ui = fixture({ requestInvitationVerification: async () => ({ error: 'Try again later' }), confirmInvitationVerification: async () => ({ error: 'Code expired. Request a new code.' }) })
  ui.mount(); ui.send(); await tick(); assert.ok(JSON.stringify(ui.draw()).includes('Try again later'))
  ui.submit(); await tick(); assert.ok(JSON.stringify(ui.draw()).includes('Code expired'))
  assert.equal(ui.verified(), 0); assert.equal(ui.draw().find(node => node.type === 'Button').props.disabled, false)
})
test('unmount prevents completion from notifying a replacement account', async () => {
  let resolve
  const ui = fixture({ confirmInvitationVerification: () => new Promise(done => { resolve = done }) })
  ui.mount(); ui.submit(); ui.unmount(); resolve({ success: true }); await tick(); assert.equal(ui.verified(), 0)
})
test('standalone verification refreshes the server page', async () => {
  const ui = fixture({ confirmInvitationVerification: async () => ({ success: true }) }, false)
  ui.mount(); ui.submit(); await tick(); assert.equal(ui.refreshed(), 1)
})
test('signed-in unverified invitation page never reads invitation metadata or claims a different account', async () => {
  let reads = 0
  const page = load('app/invitations/[id]/page.tsx', { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'Link' }, 'next/image': { default: 'Image' }, '@/lib/auth-simple': { getSession: async () => ({ email: 'account@example.test' }) }, '@/app/actions/invitations': { getInvitationVerificationStatus: async () => ({ verified: false }), getInvitationPreview: async () => { reads++ }, getInvitation: async () => null }, '@/components/invitation-email-verification': { InvitationEmailVerification: 'Verification' }, '@/components/invitation-response': {}, '@/components/saathi-logo': {}, '@/lib/identity': {} })
  const tree = await page.default({ params: Promise.resolve({ id: 'invitation' }) })
  assert.equal(reads, 0); assert.match(JSON.stringify(tree), /Ask for a new invitation link/); assert.doesNotMatch(JSON.stringify(tree), /different account/)
})

test('invitation owner can view their invitation without recipient verification', async()=>{
 let checks=0
 const page=load('app/invitations/[id]/page.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'Link'},'next/image':{default:'Image'},'@/lib/auth-simple':{getSession:async()=>({email:'owner@example.test'})},'@/app/actions/invitations':{getInvitationVerificationStatus:async()=>{checks++;return {verified:false}},getInvitation:async()=>({id:'invitation',workspaceName:'Owned workspace',inviterUsername:'Owner',inviteeEmail:'recipient@example.test',status:'pending',expiresAt:'2026-12-01'}),getInvitationPreview:async()=>({workspaceName:'Owned workspace'})},'@/components/invitation-email-verification':{InvitationEmailVerification:'Verification'},'@/components/invitation-response':{},'@/components/saathi-logo':{},'@/lib/identity':{normalizeEmail:value=>value}})
 const tree=await page.default({params:Promise.resolve({id:'invitation'})});assert.equal(checks,0);assert.ok(JSON.stringify(tree).includes('Owned workspace'));assert.equal(nodes(tree).some(node=>node.type==='Verification'),false)
})
