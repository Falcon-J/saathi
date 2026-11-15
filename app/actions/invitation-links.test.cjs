const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),crypto=require('node:crypto')
function fixture(){
 const owner={id:'owner',email:'owner@example.test'},recipient={id:'recipient',email:'recipient@example.test'},other={id:'other',email:'other@example.test'}
 let row,events=0,members=new Set(['owner']);const queries=[]
 const tx=async(strings,...v)=>{const q=strings.join('?');queries.push(q)
 if(q.includes('SELECT * FROM workspaces')){assert.match(q,/FOR UPDATE/);return [{id:'11111111-1111-4111-8111-111111111111',owner_user_id:owner.id}]}
 if(q.includes('INSERT INTO workspace_invitations')){row={id:v[0],workspace_id:v[1],inviter_user_id:v[2],invitee_email:null,token_hash:v[3],name:'Workspace',username:'Owner',inviter_email:owner.email,status:'pending',created_at:new Date(),expires_at:new Date(Date.now()+60000)};return []}
 if(q.includes('SELECT i.id,i.expires_at,i.status')){assert.match(q,/i.status='pending' AND i.expires_at>now/);assert.match(q,/i.status='accepted' AND i.accepted_by_user_id=/);assert.match(q,/EXISTS\(SELECT 1 FROM workspace_members/);assert.equal(v[1],v[2]);if(!row||v[0]!==row.token_hash)return [];if(row.status==='pending'&&row.expires_at>Date.now()||row.status==='accepted'&&row.accepted_by_user_id===v[1]&&members.has(v[1]))return [{...row,workspace_name:row.name,inviter_username:row.username}];return []}
 if(q.includes('SELECT i.*,w.name'))return row?[row]:[]
 if(q.includes('WHERE token_hash='))return row&&v[0]===row.token_hash?[row]:[]
 if(q.includes('SELECT * FROM workspace_invitations')){assert.match(q,/FOR UPDATE/);return row?[row]:[]}
 if(q.includes('SELECT user_id FROM workspace_members'))return members.has(v[1])?[{user_id:v[1]}]:[]
 if(q.includes('UPDATE workspace_invitations')){row.status='accepted';row.accepted_by_user_id=v[0];return []}
 if(q.includes('INSERT INTO workspace_members')){members.add(v[1]);return []}
 throw Error(q)}
 const db=Object.assign(tx,{begin:async callback=>callback(tx)})
 const deps={'../../features/access/service.ts':{assertWorkspaceAccess:async()=>{}},'node:crypto':crypto,zod:require('zod'),'../db/client.ts':{getDb:()=>db},'./events.ts':{appendDomainEvent:async()=>events++}}
 const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync('lib/data/invitations.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>deps[n],exports)
 return {api:exports,owner,recipient,other,workspace:'11111111-1111-4111-8111-111111111111',row:()=>row,events:()=>events,members,queries}
}
test('link creation returns256bitsecret once and stores onlyhash, owner-only',async()=>{const f=fixture();await assert.rejects(f.api.createInvitationLinkRecord(f.other,f.workspace),/owner/);const r=await f.api.createInvitationLinkRecord(f.owner,f.workspace);assert.match(r.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(f.row().token_hash,crypto.createHash('sha256').update(r.token).digest('hex'));assert.equal(r.invitation.kind,'link');assert.equal('token_hash' in r.invitation,false);assert.equal(JSON.stringify(r.invitation).includes(r.token),false)})
test('bearer admission is single-use and retryable only by winning account',async()=>{const f=fixture();const {token}=await f.api.createInvitationLinkRecord(f.owner,f.workspace);assert.equal(await f.api.acceptInvitationLinkRecord(f.recipient,token),f.workspace);assert.equal(await f.api.acceptInvitationLinkRecord(f.recipient,token),f.workspace);await assert.rejects(f.api.acceptInvitationLinkRecord(f.other,token),/no longer/);assert.equal(f.events(),2);assert.equal(f.members.size,2)})
test('existing member cannot consume a link intended for a new member',async()=>{const f=fixture();const {token}=await f.api.createInvitationLinkRecord(f.owner,f.workspace);await assert.rejects(f.api.acceptInvitationLinkRecord(f.owner,token),/already a member/);assert.equal(f.row().status,'pending')})
test('invalid, ID-only, expired and revoked links cannot admit',async()=>{const f=fixture();const {token}=await f.api.createInvitationLinkRecord(f.owner,f.workspace);for(const invalid of ['bad',f.row().id,'A'.repeat(43)])await assert.rejects(f.api.acceptInvitationLinkRecord(f.recipient,invalid));f.row().expires_at=new Date(0);await assert.rejects(f.api.acceptInvitationLinkRecord(f.recipient,token),/expired/);f.row().expires_at=new Date(Date.now()+60000);f.row().status='revoked';await assert.rejects(f.api.acceptInvitationLinkRecord(f.recipient,token),/no longer/);assert.equal(f.members.size,1)})

test('accepted link recovery is restricted to its accepting account with current membership',async()=>{const f=fixture();const {token}=await f.api.createInvitationLinkRecord(f.owner,f.workspace);await f.api.acceptInvitationLinkRecord(f.recipient,token);assert.equal((await f.api.readInvitationLinkPreview(token,f.recipient)).workspaceId,f.workspace);assert.equal(await f.api.readInvitationLinkPreview(token),null);assert.equal(await f.api.readInvitationLinkPreview(token,f.other),null);f.members.delete(f.recipient.id);assert.equal(await f.api.readInvitationLinkPreview(token,f.recipient),null)})
