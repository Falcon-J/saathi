import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlatformQueryHandlers } from './queries.ts'
import { platformContracts } from './contracts.ts'
import type { Workspace } from '../../lib/data/workspaces.ts'
import { encodeTaskCursor, normalizeTaskPage } from '../../lib/task-page.ts'
const userId = 'a0ee1450-5025-4f48-8b37-32cf71af3c44'
const workspaceId = 'b0ee1450-5025-4f48-8b37-32cf71af3c44'
const otherId = 'c0ee1450-5025-4f48-8b37-32cf71af3c44'
const principal = { userId, clientId: 'client', grantId: otherId, capabilities: ['tasks:read', 'workspaces:read'], workspaceIds: null }
const workspace: Workspace = { id: workspaceId, name: 'Outcome', targetAt: null, timezone: 'UTC', version: 1, members: [{ id: 'private@example.com', userId, email: 'private@example.com', username: 'Member', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' }], createdAt: '2026-01-01T00:00:00.000Z', ownerId: 'private@example.com', ownerUserId: userId }
test('workspace pagination is bounded, principal scoped and strips internal addresses', async () => {
  const handlers = createPlatformQueryHandlers({ listWorkspaces: async () => [workspace, { ...workspace, id: otherId }] })
  const first = await handlers['workspaces.list']!({ principal, input: { limit: 1, includeArchived: false } })
  const data = first.data as { items: unknown[]; nextCursor: string }
  assert.equal(data.items.length, 1)
  assert.ok(data.nextCursor)
  assert.ok(!JSON.stringify(data).includes('private@example.com'))
  platformContracts['workspaces.list'].output.parse({ state: 'ok', data })
  const next = await handlers['workspaces.list']!({ principal, input: { limit: 1, includeArchived: false, cursor: data.nextCursor } })
  assert.equal((next.data as { items: { id: string }[] }).items[0].id, otherId)
  await assert.rejects(() => handlers['workspaces.list']!({ principal: { ...principal, grantId: workspaceId }, input: { limit: 1, includeArchived: false, cursor: data.nextCursor } }), /cursor/i)
  const none = await handlers['workspaces.list']!({ principal: { ...principal, workspaceIds: [] }, input: { limit: 1, includeArchived: false } })
  assert.deepEqual(none.data, { items: [], nextCursor: null })
})
test('workspace restrictions are checked before reads and archived lookups enforce actual state', async () => {
  let reads = 0
  const handlers = createPlatformQueryHandlers({ readWorkspace: async () => { reads++; return workspace } })
  await assert.rejects(() => handlers['workspaces.get']!({ principal: { ...principal, workspaceIds: [] }, input: { workspaceId } }))
  assert.equal(reads, 0)
  await assert.rejects(() => handlers['archives.get']!({ principal, input: { workspaceId } }))
})
test('task projections use stable member UUIDs and preserve DAL paging without exposing address cursors', async () => {
  const taskId = otherId
  const handlers = createPlatformQueryHandlers({ readWorkspace: async () => workspace, listTaskRecordsPage: async () => ({ tasks: [{ id: taskId, workspaceId, title: 'Ship', completed: false, status: 'todo', priority: 'medium', assigneeEmail: 'private@example.com', createdBy: 'private@example.com', createdAt: workspace.createdAt, updatedAt: workspace.createdAt, version: 2 }], nextCursor: null }) })
  const result = await handlers['tasks.list']!({ principal, input: { workspaceId, limit: 50 } })
  const data = result.data as { items: { assigneeUserId: string }[] }
  assert.equal(data.items[0].assigneeUserId, userId)
  assert.ok(!JSON.stringify(data).includes('@'))
  platformContracts['tasks.list'].output.parse({ state: 'ok', data })
})
test('comments are checked against the requested task workspace and private author data is removed', async () => {
  const comment = { id: otherId, taskId: otherId, workspaceId, authorUserId: userId, authorEmail: 'private@example.com', body: 'Ready', createdAt: workspace.createdAt }
  const handlers = createPlatformQueryHandlers({ readWorkspace: async () => workspace, getTaskRecord: async () => ({ id: otherId, workspaceId, title: 'Ship', priority: 'medium', completed: false, createdAt: workspace.createdAt, updatedAt: workspace.createdAt, createdBy: 'private@example.com' }), listTaskCommentsPage: async () => ({ comments: [comment], nextCursor: null }) })
  const result = await handlers['comments.list']!({ principal, input: { workspaceId, taskId: otherId, limit: 5 } })
  assert.ok(!JSON.stringify(result).includes('@'))
  platformContracts['comments.list'].output.parse({ state: 'ok', data: result.data })
})

test('invitation preview resolves token workspace for delegation checks and exposes only minimal fields', async () => {
  let previews = 0
  const handlers = createPlatformQueryHandlers({ invitationLinkWorkspace: async () => workspaceId, readInvitationLinkPreview: async () => { previews++; return { id: otherId, workspaceName: 'Outcome', inviterUsername: 'Private', expiresAt: '2026-12-01T00:00:00.000Z', status: 'pending' } } })
  await assert.rejects(() => handlers['invitation_links.preview']!({ principal: { ...principal, workspaceIds: [] }, input: { token: 'x'.repeat(40) } }))
  assert.equal(previews, 0)
  const result = await handlers['invitation_links.preview']!({ principal: { ...principal, workspaceIds: [workspaceId] }, input: { token: 'x'.repeat(40) } })
  assert.deepEqual(Object.keys(result.data as object).sort(), ['expiresAt', 'status', 'workspaceName'])
})

test('activity maps stable historical actors without exposing actor addresses or metadata', async () => {
  const handlers = createPlatformQueryHandlers({ readWorkspace: async () => workspace, listActivityEventsPage: async () => ({ events: [{ id: otherId, eventType: 'task-created', entityType: 'task', entityId: otherId, actorUsername: 'Former', actorEmail: 'former@example.com', metadata: { secret: 'private' }, createdAt: workspace.createdAt }], nextCursor: null }), activityActorIds: async () => new Map([[otherId, userId]]) })
  const result = await handlers['activity.list']!({ principal, input: { workspaceId, limit: 50 } })
  assert.ok(!JSON.stringify(result).includes('former@example.com'))
  assert.ok(!JSON.stringify(result).includes('private'))
  platformContracts['activity.list'].output.parse({ state: 'ok', data: result.data })
})

test('task page cursors hide internal assignee addresses and bind normalized search and grant context', async () => {
  let calls = 0
  const handlers = createPlatformQueryHandlers({ readWorkspace: async () => workspace, listTaskRecordsPage: async (_actor, id, input = {}) => {
    calls++
    const scope = normalizeTaskPage(input)
    if (calls === 1) return { tasks: [], nextCursor: encodeTaskCursor(id, scope, otherId) }
    assert.equal(typeof input.cursor, 'string')
    return { tasks: [], nextCursor: null }
  } })
  const input = { workspaceId, limit: 10, search: ' Ship ', assigneeUserId: userId }
  const result = await handlers['tasks.list']!({ principal, input })
  const cursor = (result.data as { nextCursor: string }).nextCursor
  assert.ok(!Buffer.from(cursor, 'base64url').toString('utf8').includes('@'))
  await handlers['tasks.list']!({ principal, input: { ...input, search: 'ship', cursor } })
  await assert.rejects(() => handlers['tasks.list']!({ principal, input: { ...input, search: 'other', cursor } }))
})

test('capability discovery advertises installed handlers and supports complete executor discovery injection', async () => {
  const p = { ...principal, capabilities: ['tasks:read', 'tasks:write'] }
  const handlers = createPlatformQueryHandlers()
  const result = await handlers['capabilities.list']!({ principal: p, input: {} })
  const capabilities = (result.data as { capabilities: { name: string }[] }).capabilities
  assert.ok(capabilities.some(item => item.name === 'tasks.get'))
  assert.ok(!capabilities.some(item => item.name === 'tasks.create'))
  const complete = createPlatformQueryHandlers({ listExecutableCapabilities: () => [{ name: 'tasks.create', available: true }] })
  assert.deepEqual((await complete['capabilities.list']!({ principal: p, input: {} })).data, { capabilities: [{ name: 'tasks.create', available: true }] })
})
