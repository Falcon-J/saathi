import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createReceiptRunner, hashCommandInput } from './receipts.ts'
import type { ReceiptRecord, ReceiptStore } from './receipts.ts'
const actorId = '11111111-1111-4111-8111-111111111111'
const commandId = '22222222-2222-4222-8222-222222222222'
function memoryStore() {
  const records = new Map<string, ReceiptRecord>()
  let tail = Promise.resolve()
  const active = new AsyncLocalStorage<boolean>()
  const store: ReceiptStore = { async transaction(operation) {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>(resolve => { release = resolve })
    await previous
    const snapshot = new Map(records)
    try { return await active.run(true, () => operation({ lock: async () => {}, find: async key => records.get(JSON.stringify(key)) ?? null, insert: async receipt => { records.set(JSON.stringify({actorId:receipt.actorId,clientId:receipt.clientId,commandId:receipt.commandId}), receipt) } })) }
    catch (error) { records.clear(); for(const [k,v] of snapshot) records.set(k,v); throw error }
    finally { release() }
  } }
  return { store, records, isActive: () => active.getStore() === true }
}

test('replay projects current visibility without rewriting the durable outcome or executing again', async () => {
  const memory = memoryStore(), run = createReceiptRunner(memory.store)
  let writes = 0
  const args = { actorId, clientId: 'canvas', commandId, commandType: 'canvas.grant', input: {}, authorize: async () => {}, execute: async () => { writes++; return { ids: ['visible', 'now-hidden'] } } }
  await run(args)
  const replay = await run({ ...args, projectReplay: async (receipt: ReceiptRecord) => { assert.equal(memory.isActive(), true); return { ids: (receipt.result as { ids: string[] }).ids.filter(id => id === 'visible') } } })
  assert.deepEqual(replay.result, { ids: ['visible'] })
  assert.deepEqual([...memory.records.values()][0].result, { ids: ['visible', 'now-hidden'] })
  assert.equal(writes, 1)
})
test('stable hashing ignores object order but preserves value and array distinctions', () => {
  assert.equal(hashCommandInput({ b: 2, a: { y: 2, x: 1 } }), hashCommandInput({ a: { x: 1, y: 2 }, b: 2 }))
  assert.notEqual(hashCommandInput([1,2]), hashCommandInput([2,1]))
  assert.throws(() => hashCommandInput({ password: undefined }), /JSON/)
})
test('concurrent duplicate commands commit once and replay only after current authorization', async () => {
  const memory = memoryStore(), run = createReceiptRunner(memory.store)
  let executions = 0, authorizations = 0, notifications = 0
  const args = { actorId, clientId: 'desktop', commandId, commandType: 'tasks.delete', input: { taskId: actorId }, authorize: async () => { assert.equal(memory.isActive(), true); authorizations++ }, execute: async () => { executions++; return { state: 'committed', id: actorId } }, afterCommit: async () => { assert.equal(memory.isActive(), false); notifications++ } }
  const outcomes = await Promise.all([run(args), run(args)])
  assert.deepEqual(outcomes.map(o => o.replayed), [false,true])
  assert.equal(executions, 1); assert.equal(authorizations, 2); assert.equal(notifications, 1)
  await assert.rejects(run({ ...args, authorize: async () => { throw new Error('revoked') } }), /revoked/)
  await assert.rejects(run({ ...args, input: { taskId: commandId } }), { code: 'command_conflict' })
  await assert.rejects(run({ ...args, commandType: 'tasks.create' }), { code: 'command_conflict' })
})
test('actor and client partition receipts and failures leave no durable command', async () => {
  const memory = memoryStore(), run = createReceiptRunner(memory.store)
  const args = { actorId, clientId: 'a', commandId, commandType: 'tasks.delete', input: {}, authorize: async () => {}, execute: async () => ({ deleted: true }) }
  await assert.rejects(run({ ...args, execute: async () => { throw new Error('db rollback') } }), /db rollback/)
  assert.equal(memory.records.size, 0)
  await run(args); await run({ ...args, clientId: 'b' }); await run({ ...args, actorId: commandId })
  assert.equal(memory.records.size, 3)
})
test('replay authorizes persisted resolved workspace before returning historic data', async () => {
  const memory = memoryStore(), run = createReceiptRunner(memory.store)
  const workspaceId = '33333333-3333-4333-8333-333333333333'
  const args = { actorId, clientId:'scope', commandId, commandType:'workspaces.create', input:{name:'Goal'}, authorize:async()=>{}, execute:async()=>({id:workspaceId}), resolveWorkspaceId:(result:{id:string})=>result.id }
  await run(args)
  assert.equal([...memory.records.values()][0].workspaceId, workspaceId)
  await assert.rejects(run({...args, authorizeReplay:async(receipt)=>{assert.equal(receipt.workspaceId,workspaceId);throw new Error('Membership revoked')}}),/Membership revoked/)
})
test('invitation outcomes can resolve their protected workspace inside the receipt transaction', async () => {
  const memory = memoryStore(), run = createReceiptRunner(memory.store)
  const workspaceId = '33333333-3333-4333-8333-333333333333'
  const args = { actorId, clientId: 'invite-client', commandId, commandType: 'invitations.accept', input: { invitationId: commandId }, authorize: async () => {}, execute: async () => ({ id: commandId }), resolveWorkspaceId: async () => { assert.equal(memory.isActive(), true); return workspaceId } }
  await run(args)
  assert.equal([...memory.records.values()][0].workspaceId, workspaceId)
  await assert.rejects(run({ ...args, authorizeReplay: async receipt => { assert.equal(receipt.workspaceId, workspaceId); throw new Error('Access removed') } }), /Access removed/)
})
