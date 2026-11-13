const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
const source = ts.createSourceFile('verifier.mjs', fs.readFileSync('scripts/verify-ready-waiting.mjs','utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const helper = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'accessibility').getText(source)

async function run({ modal=false, escaped=false, proxyRedirects=true, violations=[] }={}) {
 const previous = { document: global.document, innerWidth: global.innerWidth }
 const calls=[], state={ waited:false }
 const inside = { closest: () => ({}), matches: () => false }
 const proxy = { closest: () => null, matches: () => true }
 const finite = { effect: { getComputedTiming: () => ({endTime:200}) }, get finished(){state.waited=true; return Promise.resolve()} }
 const infinite = { effect: { getComputedTiming: () => ({endTime:Infinity}) }, get finished(){throw Error('Do not await infinite decoration')} }
 global.innerWidth=360
 global.document={documentElement:{scrollWidth:360},activeElement:inside,getAnimations:()=>[finite,infinite]}
 const role={ count:async()=>modal?1:0,or(){return this} }
 const page={ evaluate:async(fn,arg)=>fn(arg),getByRole:()=>role,
  locator:()=>({all:async()=>[{evaluate:async fn=>{calls.push('forced-background-focus');fn({focus(){global.document.activeElement=proxyRedirects?inside:proxy}})}}]}),
  keyboard:{press:async key=>{calls.push(key);global.document.activeElement=escaped?proxy:inside}} }
 class AxeBuilder { exclude(){return this} async analyze(){calls.push('axe');assert.equal(state.waited,true,'Contrast must wait for finite transitions');return {violations}} }
 const accessibility = new Function('AxeBuilder','assert',helper+'; return accessibility')(AxeBuilder,assert)
 try { await accessibility(page);return {calls,state} } finally {global.document=previous.document;global.innerWidth=previous.innerWidth}
}

test('modal accessibility waits for finite transitions and tests keyboard focus within the modal',async()=>{
 const {calls}=await run({modal:true,proxyRedirects:false})
 assert.deepEqual(calls,['Tab','Shift+Tab','axe'])
})
test('a modal whose keyboard focus escapes fails verification',async()=>{
 await assert.rejects(run({modal:true,escaped:true}),/focus|dialog|modal/i)
})
test('outside a modal toast focus-proxy redirection remains required',async()=>{
 const {calls}=await run()
 assert.deepEqual(calls,['forced-background-focus','axe'])
 await assert.rejects(run({proxyRedirects:false}))
})
test('serious accessibility violations remain failures after transitions settle',async()=>{
 await assert.rejects(run({modal:true,violations:[{id:'color-contrast',impact:'serious',nodes:[{target:['button']}]}]}),/color-contrast/)
})
