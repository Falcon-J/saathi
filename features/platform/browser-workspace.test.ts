import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createReceiptRunner } from './receipts.ts'
import type { ReceiptRecord, ReceiptStore } from './receipts.ts'
import { browserWorkspaceFailure, createBrowserWorkspaceCreator } from './browser-workspace.ts'
import type { Workspace } from '../../lib/data/workspaces.ts'

const actorId = '11111111-1111-4111-8111-111111111111'
const commandId = '22222222-2222-4222-8222-222222222222'
const workspaceId = '33333333-3333-4333-8333-333333333333'
function fixture() {
  const records = new Map<string, ReceiptRecord>()
  let tail = Promise.resolve(), writes = 0, visible = true, fail = false
  const workspace: Workspace = { id: workspaceId, name: 'Goal', summary: undefined, archivedAt: undefined, targetAt: null, timezone: 'UTC', version: 1, createdAt: '2026-11-15T00:00:00.000Z', ownerId: 'owner@example.test', ownerUserId: actorId, members: [] }
  const store: ReceiptStore = { async transaction(operation) {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>(resolve => { release = resolve })
    await previous
    try { return await operation({ lock: async () => {}, find: async key => records.get(JSON.stringify(key)) ?? null, insert: async receipt => { records.set(JSON.stringify({ actorId: receipt.actorId, clientId: receipt.clientId, commandId: receipt.commandId }), receipt) } }) }
    finally { release() }
  } }
  const create = createBrowserWorkspaceCreator({ executeWithReceipt: createReceiptRunner(store), createWorkspaceRecord: async (actor, input) => { assert.equal(actor, actorId); assert.equal(input.tasks?.[0]?.title, 'First'); if (fail) throw new Error('failed create'); writes++; return workspace }, readWorkspace: async (_id, actor) => { assert.equal(actor, actorId); return visible ? workspace : null } })
  const input = { name: 'Goal', tasks: [{ title: 'First', bucket: 'today' as const, dueDate: undefined }] }
  return { create, input, records, workspace, writes: () => writes, hide: () => { visible = false }, fail: () => { fail = true } }
}

test('concurrent browser retries create once, preserve optional DTO fields and admit only new execution', async () => {
  const f = fixture()
  let admissions = 0
  const options = { kind: 'plan' as const, beforeCreate: async () => { admissions++ } }
  const results = await Promise.all([f.create(actorId, f.input, commandId, options), f.create(actorId, f.input, commandId, options)])
  assert.equal(results[0].id, workspaceId)
  assert.equal(results[1].id, workspaceId)
  assert.equal(f.writes(), 1)
  assert.equal(admissions, 1)
  assert.equal(f.records.size, 1)
  await f.create(actorId, f.input, commandId, { kind: 'plan', beforeCreate: async () => { throw new Error('disabled') } })
  assert.equal(f.writes(), 1)
})

test('same command rejects changed selected task content and a different creation kind', async () => {
  const f = fixture()
  await f.create(actorId, f.input, commandId)
  await assert.rejects(f.create(actorId, { ...f.input, tasks: [{ title: 'Changed' }] }, commandId), { code: 'command_conflict' })
  await assert.rejects(f.create(actorId, f.input, commandId, { kind: 'plan' }), { code: 'command_conflict' })
  assert.equal(f.writes(), 1)
})

test('replay returns current authorized projection and denies unavailable workspace without another create', async () => {
  const f = fixture()
  await f.create(actorId, f.input, commandId)
  f.workspace.name = 'Renamed'
  assert.equal((await f.create(actorId, f.input, commandId)).name, 'Renamed')
  f.hide()
  await assert.rejects(f.create(actorId, f.input, commandId), error => {
    assert.equal((error as {code?:string}).code, 'forbidden')
    assert.match((error as Error).message, /previously created.*unavailable/i)
    return true
  })
  assert.equal(f.writes(), 1)
  assert.equal(f.records.size, 1)
})

test('invalid command or task cannot create; failed create leaves no receipt', async () => {
  const f = fixture()
  await assert.rejects(f.create(actorId, f.input, 'invalid'))
  await assert.rejects(f.create(actorId, { name: 'Goal', tasks: [{ title: '' }] }, commandId))
  assert.equal(f.writes(), 0)
  f.fail()
  await assert.rejects(f.create(actorId, f.input, commandId), /failed create/)
  assert.equal(f.records.size, 0)
})

test('new execution admission failure is a known sanitized rejection and stores no receipt', async () => {
  const f = fixture()
  let failure: unknown
  try { await f.create(actorId, f.input, commandId, { beforeCreate: async () => { throw new Error('private Redis credentials') } }) }
  catch (error) { failure = error }
  const result = browserWorkspaceFailure(failure)
  assert.equal(result.unknownOutcome, false)
  assert.doesNotMatch(result.error, /credentials/)
  assert.equal(f.writes(), 0)
  assert.equal(f.records.size, 0)
})
