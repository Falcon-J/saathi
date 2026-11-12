import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { getDb } from '../../lib/db/client.ts'
import { withTransactionContext } from '../../lib/db/transaction-context.ts'
import { createWorkspaceRecord,readWorkspace,listWorkspaces,updateWorkspaceRecord,archiveWorkspaceRecord,deleteWorkspaceRecord,transferWorkspaceOwnershipRecord,removeWorkspaceMember } from '../../lib/data/workspaces.ts'
import { createTaskRecord,changeTaskRecord,listTaskRecords,listTaskRecordsPage,getTaskRecord,getTaskAggregates } from '../../lib/data/tasks.ts'
import { createTaskComment,listTaskComments,listTaskCommentsPage } from '../../lib/data/comments.ts'
import { readTaskGraph,changeTaskPrerequisite } from '../../lib/data/task-dependencies.ts'
import { listActivityEvents,listActivityEventsPage } from '../../lib/data/activity.ts'
import { getWorkspaceUsage } from '../../lib/usage.ts'
import { createInvitationRecord,createInvitationLinkRecord } from '../../lib/data/invitations.ts'
import { createCompany,createCanvasContainer,addOrganizationMember,attachWorkspace,grantCanvasAccess } from './service.ts'
const local=process.env.DATABASE_TEST_URL
if(local){const url=new URL(local);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));process.env.DATABASE_URL=local;process.env.DATABASE_POOL_MAX='5'}
test('section ACL governs existing domain DAL without expanding legacy task rights',{skip:!local},async t=>{
 const db=getDb(),owner=randomUUID(),creator=randomUUID(),blocked=randomUUID(),other=randomUUID(),actors=[owner,creator,blocked,other],company=randomUUID(),section=randomUUID(),resource=randomUUID(),readGrant=randomUUID(),otherGrant=randomUUID()
 let wid=''
 const email=(id:string)=>id+'@domain-acl.integration.test'
 const denied=(operation:()=>Promise<unknown>)=>assert.rejects(operation,{code:'forbidden'})
 const rollbackAttempt=(operation:()=>Promise<void>)=>db.begin(async tx=>withTransactionContext(tx,operation))
 console.log('Domain ACL fixture actor UUIDs:',actors.join(','))
 try{
  for(const id of actors)await db`INSERT INTO auth.users(id,email) VALUES (${id},${email(id)})`
  const ws=await createWorkspaceRecord(owner,{name:'Attached ACL fixture'});wid=ws.id
  for(const id of [creator,blocked,other])await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${wid},${id})`
  const task=await createTaskRecord(creator,wid,{title:'Creator-owned task'}),prerequisite=await createTaskRecord(owner,wid,{title:'Prerequisite'})
  await createTaskComment(creator,task.id,'Existing context')
  await createCompany(owner,{commandId:randomUUID(),id:company,name:'Domain ACL company'})
  for(const id of [creator,blocked,other])await addOrganizationMember(owner,{commandId:randomUUID(),organizationId:company,userId:id})
  await createCanvasContainer(owner,{commandId:randomUUID(),id:section,parentId:company,kind:'section',name:'Restricted section',mode:'restricted'})
  await attachWorkspace(owner,{commandId:randomUUID(),resourceId:resource,workspaceId:wid,parentId:section,mode:'inherit',expectedWorkspaceVersion:1,confirmMembershipRestriction:true})
  const resourceVersion=async(id:string)=>Number((await db`SELECT version FROM canvas_resources WHERE id=${id}`)[0].version)
  await grantCanvasAccess(owner,{commandId:randomUUID(),id:readGrant,resourceId:section,expectedVersion:await resourceVersion(section),principal:{kind:'user',id:creator},capabilities:['read']})
  await grantCanvasAccess(owner,{commandId:randomUUID(),id:otherGrant,resourceId:section,expectedVersion:await resourceVersion(section),principal:{kind:'user',id:other},capabilities:['read','create','edit','comment','delete','manage']})
  await t.test('read-only creator can read workspace, tasks, graph, comments, activity and usage',async()=>{
   assert.ok(await readWorkspace(wid,creator));assert.ok((await listWorkspaces(creator)).some(w=>w.id===wid))
   assert.equal((await listTaskRecords(creator,wid)).length,2);assert.equal((await listTaskRecordsPage(creator,wid)).tasks.length,2)
   assert.equal((await getTaskRecord(creator,wid,task.id)).id,task.id);assert.equal((await getTaskAggregates(creator,wid)).total,2)
   assert.equal((await readTaskGraph(creator,wid)).tasks.length,2);assert.equal((await listTaskComments(creator,task.id)).length,1)
   assert.equal((await listTaskCommentsPage(creator,task.id)).comments.length,1);assert.ok((await listActivityEvents(creator,wid)).length)
   assert.ok((await listActivityEventsPage(creator,wid)).events.length);assert.ok(await getWorkspaceUsage(wid,creator))
  })
  await t.test('read-only section grant denies direct create, edit, status, comment, delete and dependency calls',async()=>rollbackAttempt(async()=>{
   await denied(()=>createTaskRecord(creator,wid,{title:'Denied create'}))
   await denied(()=>changeTaskRecord(creator,task.id,'edit',{title:'Denied edit'},1))
   await denied(()=>changeTaskRecord(creator,task.id,'toggle',{},1))
   await denied(()=>createTaskComment(creator,task.id,'Denied comment'))
   await denied(()=>changeTaskRecord(creator,task.id,'delete',{},1))
   await denied(()=>changeTaskPrerequisite(creator,{workspaceId:wid,dependentTaskId:task.id,prerequisiteTaskId:prerequisite.id,expectedVersion:1,commandId:randomUUID(),operation:'add'}))
  }))
  await t.test('workspace membership without section access cannot list or read any domain data',async()=>{
   assert.equal(await readWorkspace(wid,blocked),null);assert.equal((await listWorkspaces(blocked)).some(w=>w.id===wid),false)
   for(const read of [()=>listTaskRecords(blocked,wid),()=>listTaskRecordsPage(blocked,wid),()=>getTaskRecord(blocked,wid,task.id),()=>getTaskAggregates(blocked,wid),()=>readTaskGraph(blocked,wid),()=>listTaskComments(blocked,task.id),()=>listTaskCommentsPage(blocked,task.id),()=>listActivityEvents(blocked,wid),()=>listActivityEventsPage(blocked,wid),()=>getWorkspaceUsage(wid,blocked)])await denied(read)
  })
  await t.test('ACL capabilities never expand task creator/owner/assignee authority',async()=>{
   await denied(()=>changeTaskRecord(other,task.id,'edit',{title:'Not creator'},1))
   await denied(()=>changeTaskRecord(other,task.id,'delete',{},1))
  })
  await t.test('restoring capabilities resumes creator work; revoked grant immediately removes visibility',async()=>{
   await db`UPDATE canvas_resource_grants SET capabilities=ARRAY['read','create','edit','comment','delete']::text[] WHERE id=${readGrant}`
   const updated=await changeTaskRecord(creator,task.id,'edit',{description:'Authorized creator baseline'},1);assert.equal(updated.version,2)
   await createTaskComment(creator,task.id,'Authorized comment')
   await createTaskRecord(creator,wid,{title:'Authorized create'})
   await db`UPDATE canvas_resource_grants SET revoked_at=clock_timestamp() WHERE id=${readGrant}`
   assert.equal(await readWorkspace(wid,creator),null);await denied(()=>readTaskGraph(creator,wid));await denied(()=>createTaskRecord(creator,wid,{title:'Revoked create'}))
   await db`UPDATE canvas_resource_grants SET revoked_at=NULL WHERE id=${readGrant}`
   assert.ok(await readWorkspace(wid,creator))
  })
  await t.test('workspace owners still need manage/delete ACL for settings, membership and invitations',async()=>rollbackAttempt(async()=>{
   await db`UPDATE canvas_resources SET policy_mode='restricted' WHERE id=${resource}`
   await db`UPDATE canvas_resource_grants SET capabilities=ARRAY['read']::text[] WHERE resource_id=${resource} AND user_id=${owner}`
   const version=Number((await db`SELECT version FROM workspaces WHERE id=${wid}`)[0].version)
   await denied(()=>updateWorkspaceRecord(owner,wid,{name:'Denied metadata'},version))
   await denied(()=>archiveWorkspaceRecord(owner,wid,version))
   await denied(()=>transferWorkspaceOwnershipRecord(owner,wid,other,version))
   await denied(()=>removeWorkspaceMember(owner,wid,email(other)))
   await denied(()=>createInvitationRecord({id:owner,email:email(owner)},wid,'external@domain-acl.integration.test'))
   await denied(()=>createInvitationLinkRecord({id:owner,email:email(owner)},wid))
   await denied(()=>deleteWorkspaceRecord(owner,wid))
  }))
 }finally{
  try{
   await db`DELETE FROM outbox_events WHERE workspace_id IN (SELECT workspace_id FROM activity_events WHERE actor_user_id=ANY(${db.array(actors,2950)}))`
   await db`DELETE FROM activity_events WHERE actor_user_id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM workspaces WHERE owner_user_id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM canvas_access_commands WHERE actor_user_id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM canvas_access_events WHERE actor_user_id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM canvas_resources WHERE organization_id=${company}`
   await db`DELETE FROM profiles WHERE id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM auth.users WHERE id=ANY(${db.array(actors,2950)})`
   assert.equal((await db`SELECT id FROM auth.users WHERE id=ANY(${db.array(actors,2950)})`).length,0)
   console.log('Exact domain ACL fixtures cleaned: users=0')
  }finally{await db.end()}
 }
})
