const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),ts=require('typescript')
const {resolveMcpConfig}=require('../../features/mcp/config.ts')
const {revokeMcpConnection}=require('./consent-service.ts')
const actor='11111111-1111-4111-8111-111111111111',clientId='22222222-2222-4222-8222-222222222222',grantId='33333333-3333-4333-8333-333333333333'
function load(path,deps,env){const exports={};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports','process',js)(name=>{if(name in deps)return deps[name];return require(name)},exports,{env});return exports}
function fixture({badConfig=false,anonymous=false,foreign=false,providerFails=false,cacheFails=false,origin='https://app.example.test',requestedClientId=clientId,providerOwns=false,allowedClientIds=clientId}={}){
 const events=[],env={MCP_ENABLED:badConfig?'true':'false',MCP_RESOURCE_URL:badConfig?'invalid':undefined,MCP_OAUTH_CLIENT_IDS:allowedClientIds,NEXT_PUBLIC_APP_URL:'https://app.example.test'}
 let localRevoked=false,providerRevoked=false
 const session=anonymous?null:{id:actor}
 const client=async()=>{events.push('provider-client');if(providerFails)throw Error('provider offline');return {auth:{oauth:{revokeGrant:async()=>{events.push('provider-revoke');providerRevoked=true;return {error:null}},listGrants:async()=>({data:providerOwns?[{client:{id:requestedClientId}}]:[],error:null})}}}}
 const boundary=load('components/mcp/account-boundary.ts',{'next/headers':{headers:async()=>new Headers(origin?{origin}:{})},'../../lib/auth-simple':{getSession:async()=>{events.push('session');return session}},'../../features/mcp/config':{resolveMcpConfig},'../../lib/supabase/server':{createClient:client}},env)
 const actions=load('app/connections/actions.ts',{'next/cache':{revalidatePath:()=>{if(cacheFails)throw Error('cache unavailable')}},zod:require('zod'),'../../lib/db/client':{getDb:()=>async(_strings,...values)=>{assert.equal(values[0],actor);events.push('sql');return foreign?[]:[{id:grantId}]}},'../../features/mcp/delegations':{revokeMcpDelegation:async(user,id)=>{assert.deepEqual([user,id],[actor,grantId]);events.push('local-revoke');localRevoked=true;return true}},'../../components/mcp/account-boundary':boundary,'../../components/mcp/consent-service':{revokeMcpConnection}},env)
 const form=new FormData();form.set('client_id',requestedClientId)
 return {boundary,disconnect:()=>actions.disconnectMcpConnection({},form),events,localRevoked:()=>localRevoked,providerRevoked:()=>providerRevoked}
}
for(const badConfig of [false,true])test(`own local disconnect works when endpoint ${badConfig?'misconfigured':'disabled'}, before provider cleanup`,async()=>{
 const f=fixture({badConfig});const result=await f.disconnect();assert.equal(result.revoked,true);assert.equal(f.localRevoked(),true);assert.equal(f.providerRevoked(),true)
 assert.ok(f.events.indexOf('local-revoke')<f.events.indexOf('provider-client'))
 await assert.rejects(f.boundary.requireMcpAccountAction())
})
test('provider failure preserves local revocation and recovery guidance',async()=>{const f=fixture({providerFails:true});assert.deepEqual(await f.disconnect(),{revoked:true,providerCleanupPending:true});assert.equal(f.localRevoked(),true)})
test('anonymous and foreign-origin requests cannot reach local revocation',async()=>{for(const options of [{anonymous:true},{origin:'https://other.example.test'},{origin:''}]){const f=fixture(options);assert.ok((await f.disconnect()).error);assert.equal(f.localRevoked(),false);assert.equal(f.events.includes('sql'),false)}})
test('another actor delegation cannot be revoked through a forged client selection',async()=>{const f=fixture({foreign:true});assert.ok((await f.disconnect()).error);assert.equal(f.localRevoked(),false);assert.equal(f.providerRevoked(),false)})
test('cache failure cannot turn committed local revocation into a rejected outcome',async()=>{const f=fixture({cacheFails:true});assert.equal((await f.disconnect()).revoked,true);assert.equal(f.localRevoked(),true)})
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
async function renderConnections({badConfig=false,anonymous=false}={}){
 const f=fixture({badConfig});let listed=false
 const page=load('app/connections/page.tsx',{'next/link':{__esModule:true,default:props=>React.createElement('a',props,props.children)},'next/navigation':{redirect:()=>{throw Error('login redirect')}},'../../lib/auth-simple':{getSession:async()=>anonymous?null:{id:actor}},'../../lib/supabase/server':{createClient:async()=>({auth:{oauth:{listGrants:async()=>({data:[],error:null})}}})},'../../features/mcp/config':{resolveMcpConfig:()=>badConfig?(()=>{throw Error('bad config')})():{enabled:false}},'../../components/mcp/account-boundary':f.boundary,'../../components/mcp/connections-data':{listMcpConnections:async(id)=>{assert.equal(id,actor);listed=true;return {items:[{id:grantId,clientId,capabilities:['canvas:policy_set','agent_runs:cancel'],workspaceIds:[],expiresAt:null,revokedAt:null,expired:false}],next:null}},recordedMcpClientIds:async()=>new Set([clientId])},'../../components/mcp/disconnect-form':{McpDisconnectForm:props=>React.createElement('button',{'data-client':props.clientId},'Disconnect')}},{})
 const element=await page.default({searchParams:Promise.resolve({})})
 return {html:renderToStaticMarkup(element),listed}
}
for(const badConfig of [false,true])test(`connections page retains own records and disconnect when endpoint ${badConfig?'misconfigured':'disabled'}`,async()=>{
 const result=await renderConnections({badConfig});assert.equal(result.listed,true);assert.match(result.html,/Disconnect/);assert.match(result.html,/Change access inheritance and restrictions/);assert.match(result.html,/Cancel agent work/);assert.doesNotMatch(result.html,/policy_set/)
})
test('disabled connections page still requires a live signed-in account',async()=>{await assert.rejects(renderConnections({anonymous:true}),/login redirect/)})

test('orphan provider cleanup requires both operator allowlist and the actor own provider grant',async()=>{
 const orphan=fixture({foreign:true,providerOwns:true});assert.equal((await orphan.disconnect()).revoked,true);assert.equal(orphan.localRevoked(),false);assert.equal(orphan.providerRevoked(),true)
 const unknown=fixture({foreign:true,providerOwns:true,requestedClientId:grantId});assert.ok((await unknown.disconnect()).error);assert.equal(unknown.providerRevoked(),false);assert.equal(unknown.events.includes('provider-client'),false)
 const malformed=fixture({foreign:true,providerOwns:true,allowedClientIds:clientId+',invalid value'});assert.ok((await malformed.disconnect()).error);assert.equal(malformed.providerRevoked(),false)
})
test('an owned stored connection remains locally revocable after its client leaves the operator allowlist',async()=>{
 const f=fixture({allowedClientIds:''});assert.equal((await f.disconnect()).revoked,true);assert.equal(f.localRevoked(),true)
})
