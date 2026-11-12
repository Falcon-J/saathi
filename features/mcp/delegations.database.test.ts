import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {test} from 'node:test'
import {getDb} from '../../lib/db/client.ts'
import type {Transaction} from '../../lib/db/client.ts'
import {withTransactionContext} from '../../lib/db/transaction-context.ts'
import {createWorkspaceRecord,deleteWorkspaceRecord,removeWorkspaceMember} from '../../lib/data/workspaces.ts'
import {saveMcpDelegation} from './delegations.ts'
const local=process.env.DATABASE_TEST_URL
if(local){assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(local).hostname));process.env.DATABASE_URL=local;process.env.DATABASE_POOL_MAX='5'}
test('real delegation consent uses grant-before-membership lock order',{skip:!local},async t=>{
 const db=getDb(),owner=randomUUID(),member=randomUUID(),actors=[owner,member]
 console.log('Delegation lock fixture actor UUIDs:',actors.join(','))
 try{
  for(const id of actors)await db`INSERT INTO auth.users(id,email) VALUES (${id},${id+'@delegation-lock.integration.test'})`
  for(const mode of ['leave','delete'] as const)await t.test(`concurrent consent update and ${mode} avoid a grant/membership deadlock`,async()=>{
   const ws=await createWorkspaceRecord(owner,{name:'Delegation lock fixture'}),actor=mode==='leave'?member:owner,clientId='lock-'+randomUUID()
   if(mode==='leave')await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${ws.id},${member})`
   const grant=await saveMcpDelegation(actor,clientId,{capabilities:['tasks:read'],workspaceIds:null,expiresAt:null})
   let commandReady!:()=>void,saverReady!:()=>void
   const commandHolding=new Promise<void>(resolve=>{commandReady=resolve}),saveContending=new Promise<void>(resolve=>{saverReady=resolve})
   function observe(tx:Transaction):Transaction{
    return new Proxy(tx,{
     get(target,key,receiver){if(key==='savepoint')return (callback:(child:Transaction)=>Promise<unknown>)=>target.savepoint(child=>callback(observe(child)));return Reflect.get(target,key,receiver)},
     apply(target,thisArg,args){
      const sql=Array.isArray(args[0])?args[0].join(' '):''
      if(/FROM\s+platform_delegations/i.test(sql)&&/FOR UPDATE/i.test(sql))saverReady()
      const query=Reflect.apply(target,thisArg,args)
      if(/SELECT\s+workspace_id\s+FROM\s+workspace_members/i.test(sql))return Promise.resolve(query).then(result=>{saverReady();return result})
      return query
     },
    })
   }
   let watchdog:ReturnType<typeof setTimeout>|undefined
   const command=db.begin(async tx=>withTransactionContext(tx,async()=>{
    await tx`SELECT id FROM platform_delegations WHERE id=${grant.id} FOR SHARE`
    await tx`SELECT id FROM workspaces WHERE id=${ws.id} FOR UPDATE`
    commandReady()
    await Promise.race([saveContending,new Promise<never>((_resolve,reject)=>{watchdog=setTimeout(()=>reject(new Error('Consent lock boundary not reached')),10000)})])
    if(watchdog)clearTimeout(watchdog)
    if(mode==='delete')await deleteWorkspaceRecord(actor,ws.id)
    else await removeWorkspaceMember(actor,ws.id,actor+'@delegation-lock.integration.test')
   }))
   await commandHolding
   const consent=db.begin(tx=>withTransactionContext(observe(tx),()=>saveMcpDelegation(actor,clientId,{capabilities:['tasks:read'],workspaceIds:[ws.id],expiresAt:null})))
   const result=await Promise.allSettled([command,consent]);if(watchdog)clearTimeout(watchdog)
   for(const outcome of result)if(outcome.status==='rejected')assert.notEqual(outcome.reason.code,'40P01','No PostgreSQL deadlock may escape consent or domain command')
   assert.equal(result[0].status,'fulfilled')
   assert.equal(result[1].status,'rejected')
   assert.equal((result[1] as PromiseRejectedResult).reason.code,'forbidden','Consent must recheck membership after command commits')
   const [saved]=await db`SELECT workspace_ids FROM platform_delegations WHERE id=${grant.id}`
   assert.equal(saved.workspace_ids,null,'Denied consent must not persist a now-inaccessible workspace scope')
  })
  await t.test('concurrent first consent creates one actor/client grant safely',async()=>{
   const ws=await createWorkspaceRecord(owner,{name:'New grant fixture'}),clientId='new-lock-'+randomUUID(),input={capabilities:['tasks:read'],workspaceIds:[ws.id],expiresAt:null}
   const grants=await Promise.all([saveMcpDelegation(owner,clientId,input),saveMcpDelegation(owner,clientId,input)])
   assert.equal(grants[0].id,grants[1].id)
   assert.equal((await db`SELECT id FROM platform_delegations WHERE actor_user_id=${owner} AND client_id=${clientId}`).length,1)
  })
 }finally{
  try{
   await db`DELETE FROM outbox_events WHERE workspace_id IN (SELECT workspace_id FROM activity_events WHERE actor_user_id=ANY(${db.array(actors,2950)}))`
   await db`DELETE FROM activity_events WHERE actor_user_id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM workspaces WHERE owner_user_id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM platform_delegations WHERE actor_user_id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM profiles WHERE id=ANY(${db.array(actors,2950)})`
   await db`DELETE FROM auth.users WHERE id=ANY(${db.array(actors,2950)})`
   assert.equal((await db`SELECT id FROM auth.users WHERE id=ANY(${db.array(actors,2950)})`).length,0)
   console.log('Exact delegation lock fixtures cleaned: users=0')
  }finally{await db.end()}
 }
})
