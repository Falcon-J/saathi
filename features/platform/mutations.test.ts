import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlatformMutationHandlers } from './mutations.ts'
import type { HandlerContext } from './executor.ts'
import type { Workspace } from '../../lib/data/workspaces.ts'
import type { Task } from '../../lib/task-contract.ts'
const actor = '11111111-1111-4111-8111-111111111111', wid='22222222-2222-4222-8222-222222222222', tid='33333333-3333-4333-8333-333333333333', member='44444444-4444-4444-8444-444444444444'
const workspace = { id:wid,name:'Goal',targetAt:null,timezone:'UTC',version:2,members:[{userId:member,email:'member@example.com',username:'Member',role:'member'}],ownerUserId:actor } as Workspace
const task = { id:tid,workspaceId:wid,title:'Task',priority:'medium',version:3,status:'done',completed:true } as Task
function context(input: Record<string,unknown>): HandlerContext { return { input:{workspaceId:wid,taskId:tid,expectedVersion:3,commandId:actor,...input},principal:{userId:actor,clientId:'test',grantId:actor,capabilities:[],workspaceIds:null} } }
const base = { assertWorkspaceVersion:async()=>{}, assertTaskVersion:async()=>{}, readWorkspace:async()=>workspace, getTaskRecord:async()=>task }
test('set status passes explicit edit state even when task already has that state', async()=>{
  const edits:unknown[][]=[]
  const handlers=createPlatformMutationHandlers({...base,changeTaskRecord:async(...args)=>{edits.push(args);return task}})
  const result=await handlers['tasks.set_status']!(context({status:'done'}))
  assert.equal(edits[0][2],'edit');assert.deepEqual(edits[0][3],{status:'done'});assert.equal(edits[0][4],3)
  assert.equal(result.version,3)
})
test('scoped lookup rejects a task before an ID-only DAL mutation can execute', async()=>{
  let mutations=0
  const handlers=createPlatformMutationHandlers({...base,getTaskRecord:async(user,workspaceId,taskId)=>{assert.deepEqual([user,workspaceId,taskId],[actor,wid,tid]);throw Object.assign(new Error('Not found'),{code:'not_found'})},changeTaskRecord:async()=>{mutations++;return task}})
  await assert.rejects(handlers['tasks.delete']!(context({})),{code:'not_found'});assert.equal(mutations,0)
})
test('version precondition failure prevents mutation and archived workspace rejects writes',async()=>{
  let mutations=0
  const handlers=createPlatformMutationHandlers({...base,assertTaskVersion:async()=>{throw Object.assign(new Error('Conflict'),{code:'version_conflict'})},changeTaskRecord:async()=>{mutations++;return task}})
  await assert.rejects(handlers['tasks.set_status']!(context({status:'todo'})),{code:'version_conflict'});assert.equal(mutations,0)
  const archived=createPlatformMutationHandlers({...base,readWorkspace:async()=>({...workspace,archivedAt:'2026-11-12T00:00:00Z'})})
  await assert.rejects(archived['tasks.create']!(context({title:'New',expectedVersion:null})),{code:'invalid_state'})
})
test('UUID assignee and member identities resolve to internal member email only',async()=>{
  let assignment:unknown,removed:unknown
  const handlers=createPlatformMutationHandlers({...base,changeTaskRecord:async(_user,_task,_action,changes)=>{assignment=changes;return {...task,assigneeEmail:'member@example.com'}},removeWorkspaceMember:async(...args)=>{removed=args}})
  const result=await handlers['tasks.assign']!(context({assigneeUserId:member}))
  assert.deepEqual(assignment,{assigneeEmail:'member@example.com'});assert.equal((result.data as {assigneeUserId:string}).assigneeUserId,member);assert.equal(JSON.stringify(result).includes('@'),false)
  await handlers['members.remove']!(context({memberUserId:member,expectedVersion:2}));assert.deepEqual(removed,[actor,wid,'member@example.com'])
  await assert.rejects(handlers['tasks.assign']!(context({assigneeUserId:actor})),{code:'invalid_input'})
})
test('task deletion returns a minimal tombstone with no invented version',async()=>{
  const handlers=createPlatformMutationHandlers({...base,changeTaskRecord:async()=>task})
  assert.deepEqual(await handlers['tasks.delete']!(context({})),{data:{id:tid},version:null})
})
test('workspace partial updates preserve summary and timezone while applying target date',async()=>{
  let input:unknown
  const current={...workspace,summary:'Keep this',timezone:'Asia/Kolkata',targetAt:'2026-12-01T00:00:00Z'}
  const handlers=createPlatformMutationHandlers({...base,readWorkspace:async()=>current,updateWorkspaceRecord:async(_actor,_workspace,changes)=>{input=changes;return {...current,version:3}}})
  await handlers['workspaces.update']!(context({expectedVersion:2,changes:{name:'New goal',targetDate:'2026-12-15'}}))
  assert.deepEqual(input,{name:'New goal',summary:'Keep this',timezone:'Asia/Kolkata',targetAt:'2026-12-15',targetDate:'2026-12-15'})
})
test('invitation acceptance rejects a resolved workspace outside the delegated allowlist',async()=>{
  let responses=0
  const handlers=createPlatformMutationHandlers({...base,getActor:async()=>({id:actor,email:'actor@example.com'}),readInvitationRecord:async()=>({id:tid,workspaceId:wid,workspaceName:'Goal',inviterEmail:'owner@example.com',inviterUsername:'Owner',inviteeEmail:'actor@example.com',status:'pending',createdAt:'2026-11-12T00:00:00Z',expiresAt:'2026-11-19T00:00:00Z'}),respondToInvitation:async()=>{responses++;return wid}})
  const c=context({invitationId:tid});c.principal.workspaceIds=[tid]
  await assert.rejects(handlers['invitations.accept']!(c),{code:'forbidden'});assert.equal(responses,0)
})
