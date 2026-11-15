import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { getDb } from '../../lib/db/client.ts'
import { getCurrentTransaction } from '../../lib/db/transaction-context.ts'
import { createWorkspaceRecord, deleteWorkspaceRecord, transferWorkspaceOwnershipRecord, removeWorkspaceMember } from '../../lib/data/workspaces.ts'
import { createLocalAuthFixture } from '../../scripts/local-auth-fixtures.mjs'
import { createBrowserWorkspaceCreator } from './browser-workspace.ts'

const connection = process.env.DATABASE_TEST_URL
if (connection) {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(connection).hostname), 'Requires explicit loopback database')
  process.env.DATABASE_URL = connection
  process.env.DATABASE_POOL_MAX = '5'
}
test('browser workspace creation has durable exact retries under real PostgreSQL transactions', { skip: !connection }, async t => {
  const db = getDb(), actor = randomUUID(), successor = randomUUID(), actors = [actor, successor]
  const ids: string[] = []
  const email = (id: string) => `${id}@browser-workspace.integration.test`
  try {
    for (const id of actors) {
      await createLocalAuthFixture({ email: email(id), createUser: async () => { await db`INSERT INTO auth.users(id,email) VALUES (${id},${email(id)})`; return { data: { user: { id } } } }, findUserByEmail: async () => { const [row] = await db`SELECT id FROM auth.users WHERE id=${id}`; return row ?? null } })
    }
    await t.test('concurrent retries commit one workspace, initial tasks, events, outbox and receipt', async () => {
      let admissions = 0
      const create = createBrowserWorkspaceCreator(), commandId = randomUUID()
      const input = { name: 'Exactly once browser workspace', summary: undefined, tasks: [{ title: 'First', bucket: 'today' as const }, { title: 'Second', dueDate: '2026-12-01' }] }
      const options = { kind: 'plan' as const, beforeCreate: async () => { assert.ok(getCurrentTransaction()); admissions++ } }
      const [first, second] = await Promise.all([create(actor, input, commandId, options), create(actor, input, commandId, options)])
      ids.push(first.id)
      assert.equal(first.id, second.id)
      assert.equal(admissions, 1)
      assert.equal((await db`SELECT id FROM workspaces WHERE owner_user_id=${actor}`).length, 1)
      assert.equal((await db`SELECT id FROM tasks WHERE workspace_id=${first.id}`).length, 2)
      assert.equal((await db`SELECT id FROM activity_events WHERE workspace_id=${first.id}`).length, 3)
      assert.equal((await db`SELECT id FROM outbox_events WHERE workspace_id=${first.id}`).length, 3)
      assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${actor} AND command_id=${commandId}`).length, 1)
      await assert.rejects(create(actor, { ...input, tasks: [{ title: 'Changed selection' }] }, commandId, options), { code: 'command_conflict' })
      const recovered = await create(actor, input, commandId, { kind: 'plan', beforeCreate: async () => { throw new Error('Planning disabled or quota exhausted') } })
      assert.equal(recovered.id, first.id)
      await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${first.id},${successor})`
      await transferWorkspaceOwnershipRecord(actor, first.id, successor, 1)
      await removeWorkspaceMember(successor, first.id, email(actor))
      await assert.rejects(create(actor, input, commandId, options), { code: 'forbidden' })
      await deleteWorkspaceRecord(successor, first.id)
      await assert.rejects(create(actor, input, commandId, options), { code: 'forbidden' })
      assert.equal((await db`SELECT id FROM workspaces WHERE owner_user_id=${actor}`).length, 0)
      assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${actor} AND command_id=${commandId}`).length, 1)
    })
    await t.test('failed creation rolls back workspace, initial tasks, activity, outbox and receipt together', async () => {
      const commandId = randomUUID(), name = `Rollback ${randomUUID()}`
      let attemptedId = ''
      const create = createBrowserWorkspaceCreator({ createWorkspaceRecord: async (user, input) => {
        const workspace = await createWorkspaceRecord(user, input)
        attemptedId = workspace.id
        throw new Error('Failure after nested DAL write')
      } })
      await assert.rejects(create(actor, { name, tasks: [{ title: 'Must rollback' }] }, commandId), /Failure after nested/)
      assert.ok(attemptedId)
      for (const table of ['workspaces', 'tasks', 'activity_events', 'outbox_events'] as const) {
        const column = table === 'workspaces' ? 'id' : 'workspace_id'
        assert.equal((await db`SELECT count(*)::int AS n FROM ${db(table)} WHERE ${db(column)}=${attemptedId}`)[0].n, 0, `${table} must roll back`)
      }
      assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${actor} AND command_id=${commandId}`).length, 0)
      assert.equal(getCurrentTransaction(), undefined)
    })
  } finally {
    try {
      await db.begin(async tx => {
        // A committed create can lose its response before ids.push; deleted workspaces still leave audit/outbox rows.
        const discovered = await tx`SELECT id FROM workspaces WHERE owner_user_id IN ${tx(actors)}
          UNION SELECT workspace_id AS id FROM activity_events WHERE actor_user_id IN ${tx(actors)}
          UNION SELECT workspace_id AS id FROM platform_command_receipts WHERE actor_user_id IN ${tx(actors)} AND workspace_id IS NOT NULL`
        const ownedIds = [...new Set([...ids, ...discovered.map(row => String(row.id))])]
        if (ownedIds.length) {
          await tx`DELETE FROM outbox_events WHERE workspace_id IN ${tx(ownedIds)}`
          await tx`DELETE FROM activity_events WHERE workspace_id IN ${tx(ownedIds)}`
          await tx`DELETE FROM workspaces WHERE id IN ${tx(ownedIds)}`
        }
        await tx`DELETE FROM platform_command_receipts WHERE actor_user_id IN ${tx(actors)}`
        await tx`DELETE FROM profiles WHERE id IN ${tx(actors)}`
        await tx`DELETE FROM auth.users WHERE id IN ${tx(actors)}`
        if (ownedIds.length) {
          for (const table of ['workspaces', 'tasks', 'workspace_members', 'activity_events', 'outbox_events'] as const) {
            const column = table === 'workspaces' ? 'id' : 'workspace_id'
            assert.equal((await tx`SELECT count(*)::int AS n FROM ${tx(table)} WHERE ${tx(column)} IN ${tx(ownedIds)}`)[0].n, 0, `${table} fixture rows must be removed`)
          }
        }
        assert.equal((await tx`SELECT count(*)::int AS n FROM platform_command_receipts WHERE actor_user_id IN ${tx(actors)}`)[0].n, 0)
        assert.equal((await tx`SELECT count(*)::int AS n FROM activity_events WHERE actor_user_id IN ${tx(actors)}`)[0].n, 0)
        assert.equal((await tx`SELECT count(*)::int AS n FROM profiles WHERE id IN ${tx(actors)}`)[0].n, 0)
        assert.equal((await tx`SELECT count(*)::int AS n FROM auth.users WHERE id IN ${tx(actors)}`)[0].n, 0)
      })
    } finally { await db.end() }
  }
})
