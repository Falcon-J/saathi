import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { getDb } from '../../lib/db/client.ts'
import { getCurrentTransaction } from '../../lib/db/transaction-context.ts'
import { createWorkspaceRecord, readWorkspace, transferWorkspaceOwnershipRecord } from '../../lib/data/workspaces.ts'
import { createTaskRecord } from '../../lib/data/tasks.ts'
import { createLocalAuthFixture } from '../../scripts/local-auth-fixtures.mjs'
import { createPlatformExecutor } from './executor.ts'
import type { PlatformPrincipal, PlatformHandlers } from './executor.ts'
import { createPlatformMutationHandlers } from './mutations.ts'
import { createPlatformQueryHandlers } from './queries.ts'
import { authorizePlatformReplay } from "./replay-authorization.ts"
import { executeWithReceipt } from './receipts.ts'
import { platformCapabilities } from './capabilities.ts'
import { platformContracts, resourceIdSchema } from './contracts.ts'
import type { PlatformToolName } from './contracts.ts'
import { saveMcpDelegation, getMcpDelegation, revokeMcpDelegation } from '../mcp/delegations.ts'

const connection = process.env.DATABASE_TEST_URL
if (connection) {
  const target = new URL(connection)
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname), 'Integration requires an explicit loopback DATABASE_TEST_URL')
  process.env.DATABASE_URL = connection
  process.env.DATABASE_POOL_MAX = '5'
}

test('real local PostgreSQL platform receipts and complete adapter contracts', { skip: !connection }, async t => {
  const db = getDb()
  const [presence] = await db`SELECT to_regclass('public.platform_command_receipts') IS NOT NULL AS receipts,to_regclass('public.platform_delegations') IS NOT NULL AS delegations`
  assert.deepEqual(presence, { receipts:true, delegations:true }, 'Apply normal platform migration before running integration')
  const owner = randomUUID(), member = randomUUID(), invitee = randomUUID(), actors = [owner,member,invitee]
  const clientId = `platform-integration-${randomUUID()}`
  const fixtureClients=[clientId]
  const scopes = [...new Set(platformCapabilities.filter(item => item.available).flatMap(item => [...item.requiredScopes]))]
  const email = (actor: string) => `${actor}@platform.integration.test`
  function forbidden(): never { throw Object.assign(new Error('Current access required'),{code:'forbidden'}) }
  const observed = new Set<PlatformToolName>()
  let principal!: PlatformPrincipal
  const principalFor = async (actor: string,actorClientId=clientId): Promise<PlatformPrincipal> => {
    const grant = await saveMcpDelegation(actor,actorClientId,{capabilities:scopes,workspaceIds:null,expiresAt:null})
    return {userId:actor,clientId:actorClientId,grantId:grant.id,capabilities:grant.capabilities,workspaceIds:grant.workspaceIds}
  }
  const authorize = async (actorId: string, workspaceId?: string) => {
    const grant = await getMcpDelegation({userId:actorId,clientId})
    if (!grant || (workspaceId && !await readWorkspace(workspaceId,actorId))) forbidden()
  }
  const handlers: PlatformHandlers = {...createPlatformMutationHandlers({rateLimit:async()=>{}})}
  const executor = createPlatformExecutor({handlers,
    async revalidate(actor,name,input) {
      const grant = await getMcpDelegation({userId:actor.userId,clientId:actor.clientId})
      if (!grant || grant.id !== actor.grantId) forbidden()
      const capability = platformCapabilities.find(item=>item.name===name)!
      if (!capability.requiredScopes.every(scope=>grant.capabilities.includes(scope))) forbidden()
      if (typeof input.workspaceId==='string' && !await readWorkspace(input.workspaceId,actor.userId) && name!=='workspaces.delete') forbidden()
    },
    async executeWithReceipt(args) {
      return executeWithReceipt({...args,
        async authorizeReplay(receipt) { await authorizePlatformReplay({actorId:args.actorId,commandType:args.commandType,workspaceId:receipt.workspaceId}); if(receipt.workspaceId && args.commandType!=='workspaces.delete' && !await readWorkspace(receipt.workspaceId,args.actorId)) forbidden() },
        resolveWorkspaceId(result) { const value=result as {data?:{id?:string;workspaceId?:string}};return args.workspaceId ?? value.data?.workspaceId ?? (args.commandType==='workspaces.create'||args.commandType==='invitation_links.accept'?value.data?.id:undefined) ?? null },
      })
    },
  })
  Object.assign(handlers,createPlatformQueryHandlers({listExecutableCapabilities:actor=>executor.listTools(actor)}))
  const invoke = async (name: PlatformToolName,input: Record<string,unknown>,actor=principal,expectedReplayed=false) => {
    const result = await executor.call(actor,name,input)
    assert.ok(platformContracts[name].output.safeParse(result).success, `${name}: invalid output schema`)
    assert.ok(result.state==='ok'||result.state==='committed',`${name}: ${JSON.stringify(result)}`)
    if(result.state==='committed')assert.equal(result.replayed,expectedReplayed,`${name}: must distinguish historic confirmation from a fresh command`)
    observed.add(name)
    return (result as {data:Record<string,unknown>;version?:number|null}).data
  }
  const command = () => ({commandId:randomUUID()})
  const workspaceVersion = async (id:string) => Number((await db`SELECT version FROM workspaces WHERE id=${id}`)[0].version)
  const taskVersion = async (id:string) => Number((await db`SELECT version FROM tasks WHERE id=${id}`)[0].version)
  try {
    for (const actor of actors) {
      await createLocalAuthFixture({email:email(actor),createUser:async()=>{await db`INSERT INTO auth.users(id,email) VALUES (${actor},${email(actor)})`;return {data:{user:{id:actor}}}},findUserByEmail:async(address:string)=>{const [row]=await db`SELECT id FROM auth.users WHERE id=${actor} AND email=${address}`;return row ?? null}})
      await db`INSERT INTO invitation_email_verifications(user_id,email) VALUES (${actor},${email(actor)}) ON CONFLICT(user_id) DO NOTHING`
    }
    principal=await principalFor(owner)
    const memberPrincipal=await principalFor(member), inviteePrincipal=await principalFor(invitee)
    const workspace=await createWorkspaceRecord(owner,{name:'Platform receipt integration'})
    await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${workspace.id},${member})`
    await t.test('concurrent duplicates serialize, commit one task/event/receipt, and reject changed input',async()=>{
      const commandId=randomUUID(), before=(await db`SELECT count(*)::int AS n FROM activity_events WHERE workspace_id=${workspace.id}`)[0].n
      let executions=0
      const args={actorId:owner,clientId,commandId,commandType:'integration.create',input:{title:'Exactly once'},workspaceId:workspace.id,authorize:()=>authorize(owner,workspace.id),execute:async()=>{assert.ok(getCurrentTransaction());executions++;const task=await createTaskRecord(owner,workspace.id,{title:'Exactly once'});return {id:task.id}}}
      const results=await Promise.all([executeWithReceipt(args),executeWithReceipt(args)])
      assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);assert.equal(executions,1);assert.equal(results[0].result.id,results[1].result.id)
      assert.equal((await db`SELECT count(*)::int AS n FROM tasks WHERE workspace_id=${workspace.id} AND title='Exactly once'`)[0].n,1)
      assert.equal((await db`SELECT count(*)::int AS n FROM activity_events WHERE workspace_id=${workspace.id}`)[0].n,before+1)
      assert.equal((await db`SELECT count(*)::int AS n FROM platform_command_receipts WHERE actor_user_id=${owner} AND client_id=${clientId} AND command_id=${commandId}`)[0].n,1)
      await assert.rejects(executeWithReceipt({...args,input:{title:'Different'}}),{code:'command_conflict'})
    })
    await t.test('a failed outer command rolls back nested DAL task, activity, outbox and receipt',async()=>{
      const commandId=randomUUID()
      const counts=async()=>{const [r]=await db`SELECT (SELECT count(*)::int FROM tasks WHERE workspace_id=${workspace.id}) AS tasks,(SELECT count(*)::int FROM activity_events WHERE workspace_id=${workspace.id}) AS events,(SELECT count(*)::int FROM outbox_events WHERE workspace_id=${workspace.id}) AS outbox`;return r}
      const before=await counts()
      await assert.rejects(executeWithReceipt({actorId:owner,clientId,commandId,commandType:'integration.rollback',input:{},workspaceId:workspace.id,authorize:()=>authorize(owner,workspace.id),execute:async()=>{await createTaskRecord(owner,workspace.id,{title:'Must rollback'});throw new Error('Deliberate rollback')}}),/Deliberate rollback/)
      assert.deepEqual(await counts(),before)
      assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${owner} AND client_id=${clientId} AND command_id=${commandId}`).length,0)
      assert.equal(getCurrentTransaction(),undefined)
    })
    await t.test('nested DAL savepoint rollback leaves outer transaction usable',async()=>{
      const result=await executeWithReceipt({actorId:owner,clientId,commandId:randomUUID(),commandType:'integration.savepoint',input:{},workspaceId:workspace.id,authorize:()=>authorize(owner,workspace.id),execute:async()=>{
        await assert.rejects(getDb().begin(async tx=>{await tx`INSERT INTO tasks(id,workspace_id,title,created_by_user_id) VALUES (${randomUUID()},${workspace.id},'Rolled back savepoint',${owner})`;throw new Error('Child rollback')}),/Child rollback/)
        const saved=await createTaskRecord(owner,workspace.id,{title:'Outer survives'})
        return {id:saved.id}
      }})
      assert.ok(result.result.id)
      assert.equal((await db`SELECT id FROM tasks WHERE workspace_id=${workspace.id} AND title='Rolled back savepoint'`).length,0)
      assert.equal((await db`SELECT id FROM tasks WHERE workspace_id=${workspace.id} AND title='Outer survives'`).length,1)
    })
    await t.test('two clients can reuse one external command UUID without aliasing domain effects or receipts',async()=>{
      const secondClientId='platform-second-'+randomUUID();fixtureClients.push(secondClientId)
      const second=await principalFor(owner,secondClientId),externalId=randomUUID()
      const identities=[principal,second],titles=['First client creation','Second client creation'],taskIds:string[]=[]
      for(const [index,identity]of identities.entries()){
        const input={commandId:externalId,expectedVersion:null,workspaceId:workspace.id,title:titles[index]}
        const fresh=await executor.call(identity,'tasks.create',input)
        assert.equal(fresh.state,'committed')
        if(fresh.state!=='committed')assert.fail('Each independently consented client must have an isolated command namespace')
        assert.equal(fresh.commandId,externalId);assert.equal(fresh.replayed,false)
        const data=fresh.data as {id:unknown};const id=resourceIdSchema.parse(data.id);taskIds.push(id)
        assert.equal((await db`SELECT title FROM tasks WHERE id=${id}`)[0].title,titles[index])
        const again=await executor.call(identity,'tasks.create',input)
        assert.equal(again.state,'committed');if(again.state==='committed'){assert.equal(again.replayed,true);assert.equal((again.data as {id:string}).id,id)}
      }
      assert.notEqual(taskIds[0],taskIds[1])
      assert.equal((await db`SELECT id FROM tasks WHERE id=ANY(${db.array(taskIds,2950)})`).length,2)
      const inner=await db`SELECT command_id FROM command_receipts WHERE workspace_id=${workspace.id} AND actor_user_id=${owner} AND result->>'id'=ANY(${db.array(taskIds,25)})`
      assert.equal(inner.length,2);assert.notEqual(inner[0].command_id,inner[1].command_id);assert.ok(inner.every(row=>row.command_id!==externalId))
      assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${owner} AND command_id=${externalId} AND client_id=ANY(${db.array(fixtureClients,25)})`).length,2)
    })
    await t.test('workspace creation records its resolved scope; deletion retains minimal durable tombstone',async()=>{
      const createId=randomUUID()
      const created=await invoke('workspaces.create',{commandId:createId,expectedVersion:null,name:'Scoped created workspace'})
      const createdId=resourceIdSchema.parse(created.id)
      assert.equal((await db`SELECT workspace_id FROM platform_command_receipts WHERE actor_user_id=${owner} AND client_id=${clientId} AND command_id=${createId}`)[0].workspace_id,created.id)
      const deleteId=randomUUID(),input={commandId:deleteId,expectedVersion:1,workspaceId:created.id}
      assert.deepEqual(await invoke('workspaces.delete',input),{id:created.id})
      const [receipt]=await db`SELECT result,workspace_id FROM platform_command_receipts WHERE actor_user_id=${owner} AND client_id=${clientId} AND command_id=${deleteId}`
      assert.equal(receipt.workspace_id,created.id);assert.deepEqual(receipt.result.data,{id:created.id});assert.equal(receipt.result.version,null);assert.equal(receipt.result.replayed,false)
      assert.deepEqual(await invoke('workspaces.delete',input,principal,true),{id:created.id})
      assert.equal((await db`SELECT id FROM workspaces WHERE id=${createdId}`).length,0)
    })
    await t.test('bearer invitation creation replay denies former owners and marks authorized historic confirmation',async()=>{
      const input={...command(),workspaceId:workspace.id,expectedVersion:await workspaceVersion(workspace.id)}
      const created=await invoke('invitation_links.create',input)
      await transferWorkspaceOwnershipRecord(owner,workspace.id,member,await workspaceVersion(workspace.id))
      try{
        const denied=await executor.call(principal,'invitation_links.create',input)
        assert.equal(denied.state,'rejected')
        if(denied.state==='rejected')assert.equal(denied.error.code,'forbidden')
        else assert.fail('Former owner must not receive a bearer link credential from a receipt')
      }finally{
        await transferWorkspaceOwnershipRecord(member,workspace.id,owner,await workspaceVersion(workspace.id))
      }
      const replayed=await invoke('invitation_links.create',input,principal,true)
      assert.equal(replayed.token,created.token,'Authorized retry confirms the same historical credential without issuing another')
    })
    await t.test('current access and authorizeReplay protect historic data after membership removal',async()=>{
      const commandId=randomUUID(),args={actorId:member,clientId,commandId,commandType:'integration.private',input:{},workspaceId:workspace.id,authorize:()=>authorize(member),execute:async()=>({private:'historic result'}),authorizeReplay:async()=>{if(!await readWorkspace(workspace.id,member)) forbidden()}}
      await executeWithReceipt(args)
      await db`DELETE FROM workspace_members WHERE workspace_id=${workspace.id} AND user_id=${member}`
      await assert.rejects(executeWithReceipt(args),{code:'forbidden'})
      await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${workspace.id},${member})`
      const grant=await getMcpDelegation({userId:member,clientId});assert.ok(grant);await revokeMcpDelegation(member,grant.id)
      await assert.rejects(executeWithReceipt(args),{code:'forbidden'})
      await principalFor(member)
    })
    await t.test('post-commit delivery failure preserves committed domain data and receipt',async()=>{
      const commandId=randomUUID();let warnings=0;const original=console.warn
      console.warn=()=>{warnings++}
      try {
        const result=await executeWithReceipt({actorId:owner,clientId,commandId,commandType:'integration.delivery',input:{},workspaceId:workspace.id,authorize:()=>authorize(owner,workspace.id),execute:async()=>{const task=await createTaskRecord(owner,workspace.id,{title:'Delivery failure remains committed'});return {id:task.id}},afterCommit:()=>{assert.equal(getCurrentTransaction(),undefined);throw new Error('Delivery offline')}})
        assert.equal(result.replayed,false);assert.equal(warnings,1)
        assert.equal((await db`SELECT id FROM tasks WHERE id=${result.result.id}`).length,1)
        assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${owner} AND client_id=${clientId} AND command_id=${commandId}`).length,1)
      }finally{console.warn=original}
    })
    await t.test('all 37 supported tool adapters return validated real-data schemas',async()=>{
      const wid=workspace.id
      await invoke('workspaces.list',{});await invoke('workspaces.get',{workspaceId:wid});await invoke('members.list',{workspaceId:wid})
      await invoke('workspaces.update',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid),changes:{summary:'Adapter smoke coverage'}})
      const a=await invoke('tasks.create',{...command(),workspaceId:wid,expectedVersion:null,title:'Adapter task A',assigneeUserId:member})
      const b=await invoke('tasks.create',{...command(),workspaceId:wid,expectedVersion:null,title:'Adapter task B'})
      const taskId=String(a.id),otherId=String(b.id)
      await invoke('tasks.list',{workspaceId:wid});await invoke('tasks.get',{workspaceId:wid,taskId})
      await invoke('tasks.update',{...command(),workspaceId:wid,taskId,expectedVersion:await taskVersion(taskId),changes:{description:'Context'}})
      await invoke('tasks.set_status',{...command(),workspaceId:wid,taskId,expectedVersion:await taskVersion(taskId),status:'done'})
      await invoke('tasks.assign',{...command(),workspaceId:wid,taskId,expectedVersion:await taskVersion(taskId),assigneeUserId:null})
      await invoke('comments.create',{...command(),workspaceId:wid,taskId,expectedVersion:await taskVersion(taskId),body:'Real immutable comment'})
      await invoke('comments.list',{workspaceId:wid,taskId})
      await invoke('dependencies.add',{...command(),workspaceId:wid,taskId,expectedVersion:await taskVersion(taskId),dependsOnTaskId:otherId})
      await invoke('dependencies.get',{workspaceId:wid})
      await invoke('dependencies.remove',{...command(),workspaceId:wid,taskId,expectedVersion:await taskVersion(taskId),dependsOnTaskId:otherId})
      await invoke('tasks.delete',{...command(),workspaceId:wid,taskId,expectedVersion:await taskVersion(taskId)})
      await invoke('imports.csv',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid),csv:'title,priority\nImported real task,high'})
      await invoke('activity.list',{workspaceId:wid});await invoke('usage.get',{workspaceId:wid});await invoke('capabilities.list',{})
      const inv=await invoke('invitations.send',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid),email:email(invitee)})
      await invoke('invitations.list',{workspaceId:wid})
      await invoke('invitations.decline',{...command(),expectedVersion:null,invitationId:inv.id},inviteePrincipal)
      const inv2=await invoke('invitations.send',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid),email:email(invitee)})
      await invoke('invitations.revoke',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid),invitationId:inv2.id})
      const inv3=await invoke('invitations.send',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid),email:email(invitee)})
      await invoke('invitations.accept',{...command(),expectedVersion:null,invitationId:inv3.id},inviteePrincipal)
      await invoke('members.remove',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid),memberUserId:invitee})
      const link=await invoke('invitation_links.create',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid)})
      await invoke('invitation_links.preview',{token:link.token})
      await invoke('invitation_links.accept',{...command(),expectedVersion:null,token:link.token},inviteePrincipal)
      const link2=await invoke('invitation_links.create',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid)})
      await invoke('invitation_links.revoke',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid),invitationId:link2.id})
      await invoke('members.leave',{...command(),workspaceId:wid,expectedVersion:await workspaceVersion(wid)},inviteePrincipal)
      const transfer=await invoke('workspaces.create',{...command(),expectedVersion:null,name:'Transfer and archive smoke'})
      const transferId=String(transfer.id)
      await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${transferId},${member})`
      await invoke('workspaces.transfer_ownership',{...command(),workspaceId:transferId,expectedVersion:1,newOwnerUserId:member})
      await invoke('workspaces.archive',{...command(),workspaceId:transferId,expectedVersion:await workspaceVersion(transferId)},memberPrincipal)
      await invoke('archives.list',{});await invoke('archives.get',{workspaceId:transferId})
      const available=Object.keys(handlers).sort()
      assert.deepEqual([...observed].sort(),available)
      assert.equal(observed.size,37)
    })
  } finally {
    try {
    await db`DELETE FROM platform_command_receipts WHERE actor_user_id=ANY(${db.array(actors,2950)}) AND client_id=ANY(${db.array(fixtureClients,25)})`
    await db`DELETE FROM platform_delegations WHERE actor_user_id=ANY(${db.array(actors,2950)}) AND client_id=ANY(${db.array(fixtureClients,25)})`
    await db`DELETE FROM outbox_events WHERE workspace_id IN (SELECT workspace_id FROM activity_events WHERE actor_user_id=ANY(${db.array(actors,2950)}))`
    await db`DELETE FROM activity_events WHERE actor_user_id=ANY(${db.array(actors,2950)})`
    await db`DELETE FROM workspaces WHERE owner_user_id=ANY(${db.array(actors,2950)})`
    await db`DELETE FROM profiles WHERE id=ANY(${db.array(actors,2950)})`
    await db`DELETE FROM auth.users WHERE id=ANY(${db.array(actors,2950)})`
    const [remaining]=await db`SELECT (SELECT count(*)::int FROM auth.users WHERE id=ANY(${db.array(actors,2950)})) AS users,(SELECT count(*)::int FROM profiles WHERE id=ANY(${db.array(actors,2950)})) AS profiles,(SELECT count(*)::int FROM workspaces WHERE owner_user_id=ANY(${db.array(actors,2950)})) AS workspaces,(SELECT count(*)::int FROM platform_command_receipts WHERE actor_user_id=ANY(${db.array(actors,2950)})) AS receipts`
    assert.deepEqual(remaining,{users:0,profiles:0,workspaces:0,receipts:0},'Fixture cleanup must leave no run-owned records')
    console.log('Local platform integration fixture cleanup verified: users=0 profiles=0 workspaces=0 receipts=0')
    } finally { await db.end() }
  }
})
