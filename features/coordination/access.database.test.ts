import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {test} from 'node:test'
import {getDb} from '../../lib/db/client.ts'
import {createWorkspaceRecord} from '../../lib/data/workspaces.ts'
import {createTaskRecord} from '../../lib/data/tasks.ts'
import {createCoordinationHandlers,reviewCoordinationRun,listCoordinationRunsForHuman} from './handlers.ts'
import type {CoordinationRun,CoordinationToolName} from './contracts.ts'
import type {PlatformPrincipal} from '../platform/executor.ts'
import {executeWithReceipt} from '../platform/receipts.ts'
import {createCompany,createCanvasContainer,attachWorkspace} from '../access/service.ts'
const local=process.env.DATABASE_TEST_URL
if(local){const u=new URL(local);assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));process.env.DATABASE_URL=local;process.env.DATABASE_POOL_MAX='5'}
test('real attached-section ACL governs coordinator raw SQL and human review',{skip:!local},async t=>{
 const db=getDb(),actor=randomUUID(),company=randomUUID(),section=randomUUID(),resource=randomUUID(),grantId=randomUUID(),clientId='coordination-acl-'+randomUUID(),handlers=createCoordinationHandlers()
 const principal:PlatformPrincipal={userId:actor,clientId,grantId,capabilities:['agent_runs:read','agent_runs:write','agent_runs:cancel','agent_runs:release'],workspaceIds:null}
 let workspaceId=''
 const command=(extra:Record<string,unknown>)=>({commandId:randomUUID(),workspaceId,expectedVersion:null,...extra})
 async function call(name:CoordinationToolName,input:Record<string,unknown>){return executeWithReceipt({actorId:actor,clientId,commandId:typeof input.commandId==='string'?input.commandId:randomUUID(),commandType:name,input,workspaceId,authorize:async()=>{},execute:()=>handlers[name]({input,principal})})}
 const denied=(fn:()=>Promise<unknown>)=>assert.rejects(fn,{code:'forbidden'})
 console.log('Coordinator ACL fixture actor UUID:',actor)
 try{
  await db`INSERT INTO auth.users(id,email) VALUES (${actor},${actor+'@coordination-acl.integration.test'})`
  await db`INSERT INTO platform_delegations(id,actor_user_id,client_id,capabilities) VALUES (${grantId},${actor},${clientId},${db.json([...principal.capabilities])})`
  const workspace=await createWorkspaceRecord(actor,{name:'Coordinator ACL fixture'});workspaceId=workspace.id
  const task=await createTaskRecord(actor,workspaceId,{title:'Existing queued work'}),free=await createTaskRecord(actor,workspaceId,{title:'Unclaimed work'})
  const run=(await call('agent_runs.claim',command({taskId:task.id,expectedVersion:1,leaseSeconds:600}))).result.data as CoordinationRun
  const held=()=>command({runId:run.id,fencingToken:run.fencingToken})
  await createCompany(actor,{commandId:randomUUID(),id:company,name:'Coordinator ACL company'})
  await createCanvasContainer(actor,{commandId:randomUUID(),id:section,parentId:company,kind:'section',name:'Review section',mode:'restricted'})
  await attachWorkspace(actor,{commandId:randomUUID(),resourceId:resource,workspaceId,parentId:section,mode:'restricted',expectedWorkspaceVersion:1,confirmMembershipRestriction:true})
  await db`UPDATE canvas_resource_grants SET capabilities=ARRAY['read']::text[] WHERE resource_id=${resource} AND user_id=${actor}`
  await t.test('read-only section permits run reads but denies every raw-SQL coordination mutation',async()=>{
   assert.equal(((await call('agent_runs.get',{workspaceId,runId:run.id})).result.data as CoordinationRun).id,run.id)
   assert.equal(((await call('agent_runs.list',{workspaceId,limit:50})).result.data as {items:unknown[]}).items.length,1)
   const human=await listCoordinationRunsForHuman({userId:actor,input:{workspaceId}});assert.equal(human.items[0].task.id,task.id);assert.equal(human.items[0].task.version,1);assert.equal(human.items[0].task.canReview,false)
   await denied(()=>call('agent_runs.claim',command({taskId:free.id,expectedVersion:1,leaseSeconds:60})))
   await denied(()=>call('agent_runs.cancel',command({runId:run.id})))
   for(const name of ['agent_runs.start','agent_runs.release'] as const)await denied(()=>call(name,held()))
   await denied(()=>call('agent_runs.heartbeat',{...held(),leaseSeconds:60}))
   await denied(()=>call('agent_runs.report',{...held(),progress:'Denied report'}))
   await denied(()=>call('agent_runs.submit_review',{...held(),evidence:[{kind:'text',text:'Denied submission'}]}))
  })
  await t.test('restored grant resumes work; revoked section access blocks reads, writes and human approval',async()=>{
   await db`UPDATE canvas_resource_grants SET capabilities=ARRAY['read','create','edit','comment','manage','delete']::text[] WHERE resource_id=${resource} AND user_id=${actor}`
   await call('agent_runs.start',held());await call('agent_runs.report',{...held(),progress:'Authorized external progress'})
   await call('agent_runs.submit_review',{...held(),evidence:[{kind:'text',text:'Ready for human review'}]})
   await db`UPDATE canvas_resource_grants SET revoked_at=clock_timestamp() WHERE resource_id=${resource} AND user_id=${actor}`
   await denied(()=>call('agent_runs.get',{workspaceId,runId:run.id}))
   await denied(()=>listCoordinationRunsForHuman({userId:actor,input:{workspaceId}}))
   await denied(()=>call('agent_runs.heartbeat',{...held(),leaseSeconds:60}))
   await denied(()=>reviewCoordinationRun({reviewerUserId:actor,input:{commandId:randomUUID(),workspaceId,runId:run.id,decision:'approve',expectedTaskVersion:1}}))
   assert.equal((await db`SELECT status FROM tasks WHERE id=${task.id}`)[0].status,'todo')
   await db`UPDATE canvas_resource_grants SET revoked_at=NULL,capabilities=ARRAY['read']::text[] WHERE resource_id=${resource} AND user_id=${actor}`
   await denied(()=>reviewCoordinationRun({reviewerUserId:actor,input:{commandId:randomUUID(),workspaceId,runId:run.id,decision:'approve',expectedTaskVersion:1}}))
  })
 }finally{
  try{
   await db`DELETE FROM platform_command_receipts WHERE actor_user_id=${actor}`
   await db`DELETE FROM outbox_events WHERE workspace_id IN (SELECT workspace_id FROM activity_events WHERE actor_user_id=${actor})`
   await db`DELETE FROM activity_events WHERE actor_user_id=${actor}`
   await db`DELETE FROM workspaces WHERE owner_user_id=${actor}`
   await db`DELETE FROM platform_delegations WHERE actor_user_id=${actor}`
   await db`DELETE FROM canvas_access_commands WHERE actor_user_id=${actor}`
   await db`DELETE FROM canvas_access_events WHERE actor_user_id=${actor}`
   await db`DELETE FROM canvas_resources WHERE organization_id=${company}`
   await db`DELETE FROM profiles WHERE id=${actor}`
   await db`DELETE FROM auth.users WHERE id=${actor}`
   assert.equal((await db`SELECT id FROM auth.users WHERE id=${actor}`).length,0)
   console.log('Exact coordinator ACL fixtures cleaned: users=0')
  }finally{await db.end()}
 }
})
