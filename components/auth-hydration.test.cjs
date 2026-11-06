const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
const jsx = (type, props) => ({ type, props })
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : typeof node.type === 'function' ? nodes(node.type(node.props)) : [node, ...nodes(node.props?.children)]
function harness(file, name, mode, action) {
 const slots=[], effects=[], destinations=[]; let cursor=0
 const react={useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value}]},useRef(value){const index=cursor++;if(!(index in slots))slots[index]={current:value};return slots[index]},useEffect(effect,deps){const index=cursor++;if(!slots[index]||deps.some((v,i)=>v!==slots[index][i])){slots[index]=deps;effects.push(effect)}}}
 const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/image':{default:'Image'},'next/link':{default:'Link'},'next/navigation':{useRouter:()=>({replace:value=>destinations.push(value),refresh(){}})},'lucide-react':{},'@/lib/auth-simple':{login:action,signup:action,requestPasswordReset:action,updatePassword:action},'@/lib/supabase/auth-boundary':{safeAuthRedirect:()=>'/dashboard'},'@/components/ui/button':{Button:'Button'},'@/components/ui/input':{Input:'Input'},'@/hooks/use-notifications':{useNotifications:()=>({success(){}})},'@/components/saathi-logo':{SaathiLogo:'SaathiLogo'}}
 const loaded={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(key=>{assert.ok(key in deps,key);return deps[key]},loaded)
 const draw=()=>{cursor=0;return nodes(loaded[name]({mode}))}
 return {draw,destinations,mount(){draw();effects.splice(0).forEach(effect=>effect());return draw()},fill(){for(const input of draw().filter(node=>node.type==='Input')) input.props.onChange({target:{value:input.props.type==='email'?'qa@example.test':input.props.type==='password'?'long-password':'QA'}})},submit(){return draw().find(node=>node.type==='form').props.onSubmit({preventDefault(){}})}}
}
for(const [file,name,mode] of [['components/auth-form.tsx','AuthForm','login'],['components/auth-form.tsx','AuthForm','signup'],['components/password-recovery-form.tsx','PasswordRecoveryForm','request'],['components/password-recovery-form.tsx','PasswordRecoveryForm','update']]) {
 test(`${name} ${mode} disables SSR controls and guards actions until hydrated`, async()=>{
  const oldWindow=global.window;global.window={location:{search:''},localStorage:{setItem(){}}}
  let calls=0
  try {
   const ui=harness(file,name,mode,async()=>{calls++;return {success:true}})
   const controls=ui.draw().filter(node=>['Input','Button','button'].includes(node.type))
   assert.ok(controls.length>0);assert.ok(controls.every(node=>node.props.disabled===true))
   ui.fill();await ui.submit();assert.equal(calls,0)
   const mounted=ui.mount();assert.ok(mounted.filter(node=>node.type==='Input').every(node=>node.props.disabled===false))
   ui.fill();await ui.submit();assert.equal(calls,1)
  } finally {global.window=oldWindow}
 })
 test(`${name} ${mode} rejects duplicate submissions before rerender`,async()=>{
  const oldWindow=global.window;global.window={location:{search:''},localStorage:{setItem(){}}};let calls=0,finish
  try {const ui=harness(file,name,mode,()=>{calls++;return new Promise(resolve=>{finish=resolve})});ui.mount();ui.fill();const handler=ui.draw().find(node=>node.type==='form').props.onSubmit;const first=handler({preventDefault(){}});const second=handler({preventDefault(){}});assert.equal(calls,1);finish({error:'retry'});await Promise.all([first,second])}finally{global.window=oldWindow}
 })
}
test('committed login still redirects when optional localStorage broadcast fails',async()=>{
 const oldWindow=global.window;global.window={location:{search:''},localStorage:{setItem(){throw Error('Storage blocked')}}}
 try {const ui=harness('components/auth-form.tsx','AuthForm','login',async()=>({success:true}));ui.mount();ui.fill();await ui.submit();assert.deepEqual(ui.destinations,['/dashboard']);assert.equal(ui.draw().some(node=>node.props?.role==='alert'),false)}finally{global.window=oldWindow}
})

for (const mode of ['login', 'signup']) test(mode + ' offers email/password without a Google provider', () => {
 const ui=harness('components/auth-form.tsx','AuthForm',mode,async()=>({success:true}))
 assert.doesNotMatch(JSON.stringify(ui.draw()), /Google|or continue with/)
})

test('signup enters the dashboard immediately when a session is returned', async () => {
 const oldWindow=global.window;global.window={location:{search:''},localStorage:{setItem(){}}}
 try {const ui=harness('components/auth-form.tsx','AuthForm','signup',async()=>({success:true,confirmationRequired:false}));ui.mount();ui.fill();await ui.submit();assert.deepEqual(ui.destinations,['/dashboard']);assert.doesNotMatch(JSON.stringify(ui.draw()),/Check your email/)}finally{global.window=oldWindow}
})

test('unexpected confirmation requirement offers recovery without pretending signup signed in', async () => {
 const oldWindow=global.window;global.window={location:{search:''},localStorage:{setItem(){}}}
 try {const ui=harness('components/auth-form.tsx','AuthForm','signup',async()=>({success:true,confirmationRequired:true}));ui.mount();ui.fill();await ui.submit();assert.deepEqual(ui.destinations,[]);assert.match(JSON.stringify(ui.draw()),/Check your email/);assert.ok(ui.draw().some(node=>node.type==='Link'&&node.props.children==='Return to sign in'))}finally{global.window=oldWindow}
})
