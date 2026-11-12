const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(file,deps){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>{assert.ok(n in deps,n);return deps[n]},exports);return exports}
function fixture({proof=false,currentEmail='recipient@example.test',otpId='recipient',otpEmail='recipient@example.test',otpError=null,quotaError=false,ownerDetail=false,registryMissing=false}={}){
 const actor={id:'recipient',email:'recipient@example.test'}, calls=[], writes=[]
 const tx=async(strings,...v)=>{const q=strings.join('?');calls.push(q)
 if(q.includes('FROM auth.users'))return currentEmail?[{id:actor.id,email:currentEmail}]:[]
 if(q.includes('FROM invitation_email_verifications')){if(registryMissing)throw Error('registry unavailable');return proof?[{user_id:actor.id}]:[]}
 if(q.includes('INSERT INTO invitation_email_verifications')){proof=true;writes.push('proof');return []}
 if(q.includes('SELECT workspace_id FROM workspace_invitations'))return [{workspace_id:'workspace'}]
 if(q.includes('SELECT * FROM workspaces'))return [{id:'workspace',owner_user_id:'owner'}]
 if(q.includes('SELECT * FROM workspace_invitations'))return [{id:'invite',invitee_email:actor.email,status:'pending',expires_at:new Date(Date.now()+60000)}]
 if(q.includes('SELECT i.id')&&q.includes('FROM workspace_invitations'))return ownerDetail&&q.includes('owner_user_id')?[{id:'invite',workspace_id:'workspace'}]:[]
 if(q.includes('SELECT i.*,w.name'))return [{id:'invite',workspace_id:'workspace',name:'Owned workspace',username:'Owner',inviter_email:'owner@example.test',invitee_email:actor.email,status:'pending',created_at:new Date(),expires_at:new Date(Date.now()+60000)}]
 if(q.includes('SELECT id FROM workspaces'))return [{id:'workspace'}]
 if(q.includes('SELECT id FROM workspace_invitations'))return []
 if(q.includes('FROM workspace_invitations')&&q.includes('owner_user_id'))return []
 if(q.includes('UPDATE workspace_invitations')){writes.push('response');return []}
 if(q.includes('INSERT INTO workspace_members')){writes.push('member');return []}
 throw Error(q)}
 const db={begin:async(...args)=>args.at(-1)(tx)}
 const domain=load('lib/data/invitations.ts',{'../../features/access/service.ts':{assertWorkspaceAccess:async()=>{}},'node:crypto':require('node:crypto'),zod:require('zod'),'../db/client.ts':{getDb:()=>db},'./events.ts':{appendDomainEvent:async()=>{writes.push('event')}}})
 const otpCalls=[],limits=[]
 const actions=load('app/actions/invitations.ts',{'@/lib/auth-simple':{getSession:async()=>actor},'@/lib/post-commit':{afterDomainCommit(){}},'@/lib/data/invitations':domain,'@/lib/rate-limit':{RateLimitExceeded:class extends Error{},consumeDistributedRateLimit:async(...args)=>{limits.push(args);if(quotaError)throw Error('offline')}},'node:crypto':require('node:crypto'),'@/lib/supabase/config':{getSupabaseConfig:()=>({url:'https://local.test',key:'public'})},'@supabase/supabase-js':{createClient:(url,key,options)=>{otpCalls.push({options});return {auth:{signInWithOtp:async args=>{otpCalls.push(args);return {error:otpError}},verifyOtp:async args=>{otpCalls.push(args);return {data:{user:{id:otpId,email:otpEmail}},error:otpError}}}}}}})
 return {domain,actions,actor,writes,calls,otpCalls,limits}
}
for(const method of ['accepted','declined'])test(`autoconfirmed recipient without independent proof cannot ${method}`,async()=>{const f=fixture();await assert.rejects(f.domain.respondToInvitation(f.actor,'invite',method),/Verify your email/);assert.deepEqual(f.writes,[])})
test('unverified recipient cannot list or read invitation details',async()=>{const f=fixture();await assert.rejects(f.domain.listInvitationRecords(f.actor),/Verify your email/);await assert.rejects(f.domain.readInvitationRecord(f.actor,'invite'),/Verify your email/)})
test('proof cannot survive mismatch with current auth email',async()=>{const f=fixture({proof:true,currentEmail:'new@example.test'});await assert.rejects(f.domain.respondToInvitation(f.actor,'invite','accepted'),/Verify your email/);assert.deepEqual(f.writes,[])})
test('verified recipient accepts under locked current identity',async()=>{const f=fixture({proof:true});assert.equal(await f.domain.respondToInvitation(f.actor,'invite','accepted'),'workspace');assert.ok(f.calls.some(q=>q.includes('FROM auth.users')&&q.includes('FOR SHARE')));assert.ok(f.writes.includes('member'))})
test('OTP send binds actor email, disables account creation and session persistence',async()=>{const f=fixture();assert.equal((await f.actions.requestInvitationVerification()).success,true);assert.deepEqual(f.otpCalls[0].options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});assert.deepEqual(f.otpCalls[1],{email:f.actor.email,options:{shouldCreateUser:false}});assert.ok(f.limits.length)})
for(const options of [{otpId:'other'},{otpEmail:'other@example.test'},{otpError:{message:'secret provider details'}},{currentEmail:'changed@example.test'}])test(`OTP rejection does not mark proof ${JSON.stringify(options)}`,async()=>{const f=fixture(options);const result=await f.actions.confirmInvitationVerification('123456');assert.ok(result.error);assert.ok(!result.error.includes('secret'));assert.deepEqual(f.writes,[])})
test('matching OTP identity marks proof without returning session tokens',async()=>{const f=fixture();assert.deepEqual(await f.actions.confirmInvitationVerification('123456'),{success:true});assert.deepEqual(f.writes,['proof']);assert.deepEqual(f.otpCalls[1],{email:f.actor.email,token:'123456',type:'email'});assert.ok(f.calls.some(q=>q.includes('FOR UPDATE')));assert.ok(f.limits.length)})
test('verification dependency failures fail closed before provider call',async()=>{const f=fixture({quotaError:true});assert.ok((await f.actions.confirmInvitationVerification('123456')).error);assert.deepEqual(f.otpCalls,[]);assert.deepEqual(f.writes,[])})
test('invalid codes cannot reach provider',async()=>{const f=fixture();assert.ok((await f.actions.confirmInvitationVerification('not-a-code')).error);assert.deepEqual(f.otpCalls,[])})


test('unverified owner may read and manage their own invitations',async()=>{const f=fixture({ownerDetail:true});assert.equal((await f.domain.readInvitationRecord(f.actor,'invite')).workspaceName,'Owned workspace');assert.equal(f.calls.some(q=>q.includes('FROM invitation_email_verifications')),false);const owner={id:'owner',email:'owner@example.test'};assert.deepEqual(await f.domain.listInvitationRecords(owner,'workspace'),[]);assert.equal(await f.domain.respondToInvitation(owner,'invite','revoked'),'workspace')})
test('missing registry fails status and recipient access closed',async()=>{const f=fixture({registryMissing:true});assert.equal((await f.actions.getInvitationVerificationStatus()).verified,false);await assert.rejects(f.domain.listInvitationRecords(f.actor));await assert.rejects(f.domain.respondToInvitation(f.actor,'invite','accepted'));assert.deepEqual(f.writes,[])})
