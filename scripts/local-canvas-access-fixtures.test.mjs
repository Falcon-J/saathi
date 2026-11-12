import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { canvasAccessEnabled, planCanvasAccessFixtures, seedCanvasAccessFixtures, cleanupCanvasAccessFixtures } from './local-canvas-access-fixtures.mjs'

const workspaces = Array.from({ length: 4 }, randomUUID)
const users = Array.from({ length: 100 }, (_, index) => ({ id: randomUUID(), workspace: workspaces[Math.floor(index / 25)] }))
const makePlan = () => planCanvasAccessFixtures(workspaces)
const fakeDatabase = (remaining = {}) => {
  const queries = []
  const tx = async (strings, ...values) => {
    const sql = strings.join('?').replace(/\s+/g, ' ').trim()
    queries.push({ sql, values })
    if (sql.startsWith('SELECT')) return [{ resources: 0, organizations: 0, groups: 0, organization_members: 0, group_members: 0, grants: 0, references: 0, events: 0, commands: 0, ...remaining }]
    return []
  }
  return { queries, tx }
}

test('canvas fixtures require the explicit strict true flag', () => {
  assert.equal(canvasAccessEnabled(undefined), false)
  assert.equal(canvasAccessEnabled('false'), false)
  assert.equal(canvasAccessEnabled('true'), true)
  for (const invalid of ['', '1', 'TRUE', ' true ', 'yes']) assert.throws(() => canvasAccessEnabled(invalid))
})

test('each workspace gets its own section and canonical resource; every planned UUID is owned and unique', () => {
  const plan = makePlan()
  assert.equal(plan.attachments.length, 4)
  assert.deepEqual(plan.attachments.map(row => row.workspaceId), workspaces)
  const ids = [plan.organizationId, plan.groupId, ...plan.attachments.flatMap(row => [row.sectionId, row.resourceId, row.grantId])]
  assert.equal(new Set(ids).size, 14)
  assert.equal(ids.some(id => workspaces.includes(id)), false)
  assert.throws(() => planCanvasAccessFixtures([workspaces[0], workspaces[0]]))
  assert.throws(() => planCanvasAccessFixtures(['not-a-uuid']))
})

test('all identities use group membership and full section grants, with no task or baseline membership writes', async () => {
  const plan = makePlan(), { queries, tx } = fakeDatabase()
  const counts = await seedCanvasAccessFixtures(tx, plan, users)
  assert.deepEqual(counts, { organizations: 1, groups: 1, sections: 4, attachedWorkspaces: 4, organizationMembers: 100, groupMembers: 100, grants: 4 })
  assert.equal(queries.filter(row => row.sql.startsWith('INSERT INTO canvas_organization_members')).length, 100)
  assert.equal(queries.filter(row => row.sql.startsWith('INSERT INTO canvas_group_members')).length, 100)
  const grants = queries.filter(row => row.sql.startsWith('INSERT INTO canvas_resource_grants'))
  assert.equal(grants.length, 4)
  for (const row of grants) {
    assert.ok(row.values.includes(plan.groupId))
    assert.deepEqual(row.values.find(Array.isArray), ['read', 'create', 'edit', 'comment', 'manage', 'delete'])
    assert.ok(!row.sql.includes('user_id,group_id'))
  }
  const resources = queries.filter(row => row.sql.startsWith('INSERT INTO canvas_resources'))
  assert.equal(resources.length, 9)
  assert.equal(resources.filter(row => row.sql.includes("'section'") && row.sql.includes("'restricted'")).length, 4)
  assert.equal(resources.filter(row => row.sql.includes("'workspace'") && row.sql.includes("'inherit'")).length, 4)
  assert.equal(queries.some(row => /(?:INSERT|UPDATE|DELETE).*\b(tasks|workspace_members)\b/.test(row.sql)), false)
})

test('invalid fixture actors fail before any insert', async () => {
  for (const actors of [[], [{ id: 'bad-id', workspace: workspaces[0] }], users.slice(0, 25), [...users, users[0]]]) {
    const { queries, tx } = fakeDatabase()
    await assert.rejects(seedCanvasAccessFixtures(tx, makePlan(), actors))
    assert.equal(queries.length, 0)
  }
})

test('cleanup is scoped to exact owned IDs and removes descendants before the company root', async () => {
  const plan = makePlan(), { queries, tx } = fakeDatabase()
  const counts = await cleanupCanvasAccessFixtures(tx, plan)
  assert.ok(Object.values(counts).every(count => count === 0))
  const deletes = queries.filter(row => row.sql.startsWith('DELETE'))
  assert.deepEqual(deletes.map(row => row.sql.match(/DELETE FROM (\w+)/)[1]), ['canvas_resources', 'canvas_resources', 'canvas_resources'])
  assert.deepEqual(deletes[0].values[0], plan.attachments.map(row => row.resourceId))
  assert.deepEqual(deletes[1].values[0], plan.attachments.map(row => row.sectionId))
  assert.equal(deletes[2].values[0], plan.organizationId)
  for (const row of deletes) assert.ok(row.sql.includes('WHERE'))
})

test('nonzero cleanup evidence fails rather than reporting success', async () => {
  const { tx } = fakeDatabase({ groups: 1 })
  await assert.rejects(cleanupCanvasAccessFixtures(tx, makePlan()), /Owned canvas fixture cleanup/)
})
