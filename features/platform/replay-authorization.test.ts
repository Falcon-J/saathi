import assert from 'node:assert/strict'
import {test} from 'node:test'
import {authorizePlatformReplay} from './replay-authorization.ts'
import type {ReplayAuthorizationDependencies} from './replay-authorization.ts'
import type {Transaction} from '../../lib/db/client.ts'
const actorId='11111111-1111-4111-8111-111111111111',workspaceId='22222222-2222-4222-8222-222222222222'
function fixture(){
 const tx=(()=>{}) as unknown as Transaction
 let owner=actorId,archivedAt:string|null=null,manage=true,reads=0,checks=0
 const dependencies:ReplayAuthorizationDependencies={getTransaction:()=>tx,readWorkspace:async(active,id)=>{assert.equal(active,tx);assert.equal(id,workspaceId);reads++;return {ownerUserId:owner,archivedAt}},requireManage:async(actor,id,active)=>{assert.deepEqual([actor,id],[actorId,workspaceId]);assert.equal(active,tx);checks++;if(!manage)throw Object.assign(new Error('Current access required'),{code:'forbidden'})}}
 return {dependencies,loseOwner:()=>{owner=workspaceId},restrict:()=>{manage=false},archive:()=>{archivedAt='2026-11-13T00:00:00Z'},reads:()=>reads,checks:()=>checks}
}
for(const commandType of ['invitation_links.create','invitations.send'])test(`${commandType} replay requires current active owner and manage permission`,async()=>{
 const f=fixture(),input={actorId,workspaceId,commandType}
 await authorizePlatformReplay(input,f.dependencies);assert.equal(f.reads(),1);assert.equal(f.checks(),1)
 f.restrict();await assert.rejects(authorizePlatformReplay(input,f.dependencies),{code:'forbidden'})
 const lost=fixture();lost.loseOwner();await assert.rejects(authorizePlatformReplay(input,lost.dependencies),{code:'forbidden'});assert.equal(lost.checks(),0)
 const archived=fixture();archived.archive();await assert.rejects(authorizePlatformReplay(input,archived.dependencies),{code:'forbidden'})
})
test('protected receipt fails closed without transaction or persisted workspace scope',async()=>{
 const f=fixture(),input={actorId,workspaceId,commandType:'invitation_links.create'}
 await assert.rejects(authorizePlatformReplay(input,{...f.dependencies,getTransaction:()=>undefined}),{code:'unavailable'})
 await assert.rejects(authorizePlatformReplay({...input,workspaceId:null},f.dependencies),{code:'forbidden'})
})
test('ownership transfer historic confirmation does not require retaining former ownership',async()=>{
 const f=fixture();f.loseOwner();f.restrict()
 await authorizePlatformReplay({actorId,workspaceId,commandType:'workspaces.transfer_ownership'},f.dependencies)
 assert.equal(f.reads(),0);assert.equal(f.checks(),0)
})
