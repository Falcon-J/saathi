import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { actorSchema, commandResultSchema, platformContracts } from './contracts.ts'
const id = '11111111-1111-4111-8111-111111111111'
const command = { commandId: id, expectedVersion: 1, workspaceId: id, taskId: id }

test('workspace initial tasks match the domain maximum of twenty',()=>{
  const input={commandId:id,expectedVersion:null,name:'Goal',tasks:Array.from({length:20},()=>({title:'Initial task'}))}
  assert.equal(platformContracts['workspaces.create'].input.safeParse(input).success,true)
  assert.equal(platformContracts['workspaces.create'].input.safeParse({...input,tasks:[...input.tasks,{title:'One too many'}]}).success,false)
})
test('task writes require exact resource, version, command and explicit status', () => {
  const schema = platformContracts['tasks.set_status'].input
  assert.equal(schema.safeParse({ ...command, status: 'done' }).success, true)
  for (const extra of [{ status: 'toggle' }, { status: 'done', taskId: 'bad' }, { status: 'done', actorId: id }, { status: 'done', expectedVersion: 0 }, { status: 'done', commandId: undefined }]) {
    assert.equal(schema.safeParse({ ...command, ...extra }).success, false)
  }
  assert.equal(platformContracts['tasks.get'].input.safeParse({ workspaceId: id, invitationId: id }).success, false)
})
test('commands distinguish persistence from rejection, conflict and uncertain outcome', () => {
  const result = commandResultSchema(z.strictObject({ id: z.uuid() }))
  assert.equal(result.safeParse({ state: 'committed', commandId: id, version: 2, data: { id } }).success, true)
  assert.equal(result.safeParse({ state: 'rejected', commandId: id, error: { code: 'forbidden', message: 'Owner required' } }).success, true)
  assert.equal(result.safeParse({ state: 'conflict', commandId: id, currentVersion: 3, error: { code: 'version_conflict', message: 'Read again' } }).success, true)
  assert.equal(result.safeParse({ state: 'unconfirmed', commandId: id, error: { code: 'unavailable', message: 'Reconcile command' } }).success, true)
  assert.equal(result.safeParse({ state: 'committed', commandId: id, error: { code: 'forbidden', message: 'No' } }).success, false)
  assert.equal(actorSchema.safeParse({ userId: id, source: 'verified_session' }).success, true)
  assert.equal(actorSchema.safeParse({ userId: 'email@example.com', source: 'verified_session' }).success, false)
})
test('list boundaries are paginated, reject secrets, and deadline forms are exclusive', () => {
  assert.deepEqual(platformContracts['tasks.list'].input.parse({ workspaceId: id }), { workspaceId: id, limit: 50 })
  assert.equal(platformContracts['tasks.list'].input.safeParse({ workspaceId: id, limit: 501 }).success, false)
  assert.equal(platformContracts['workspaces.create'].input.safeParse({ commandId: id, expectedVersion: null, name: 'Goal', password: 'secret' }).success, false)
  assert.equal(platformContracts['tasks.create'].input.safeParse({ commandId: id, expectedVersion: null, workspaceId: id, title: 'Task', dueDate: '2026-11-12', dueAt: '2026-11-12T12:00:00Z' }).success, false)
})
test('domain limits, workspace targets and versionless commits match authoritative records', () => {
  const workspace = platformContracts['workspaces.create'].input
  assert.equal(workspace.safeParse({ commandId: id, expectedVersion: null, name: 'Goal', summary: 'Outcome', targetDate: '2026-11-12' }).success, true)
  assert.equal(workspace.safeParse({ commandId: id, expectedVersion: null, name: 'x'.repeat(101) }).success, false)
  assert.equal(platformContracts['tasks.create'].input.safeParse({ commandId: id, expectedVersion: null, workspaceId: id, title: 'Task', description: 'x'.repeat(1001) }).success, false)
  assert.equal(platformContracts['tasks.create'].input.safeParse({ commandId: id, expectedVersion: null, workspaceId: id, title: 'Task', bucket: 'later' }).success, false)
  assert.equal(platformContracts['comments.create'].input.safeParse({ ...command, body: 'x'.repeat(2001) }).success, false)
  assert.equal(platformContracts['usage.get'].input.safeParse({}).success, false)
  assert.equal(commandResultSchema(z.strictObject({ id: z.uuid() })).safeParse({ state: 'committed', commandId: id, version: null, data: { id } }).success, true)
})
test('workspace creation retains structured initial tasks', () => {
  assert.equal(platformContracts['workspaces.create'].input.safeParse({ commandId: id, expectedVersion: null, name: 'Goal', tasks: [{ title: 'First step', bucket: 'next', estimatedMinutes: 30 }] }).success, true)
})
