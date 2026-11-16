import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { getDb, type Transaction } from '../../lib/db/client.ts'
import { withTransactionContext } from '../../lib/db/transaction-context.ts'
import { createWorkspaceRecord } from '../../lib/data/workspaces.ts'
import { createTaskRecord, listTaskRecordsPage, getTaskAggregates } from '../../lib/data/tasks.ts'
import { createCompany, createCanvasContainer, addOrganizationMember, attachWorkspace, grantCanvasAccess } from './service.ts'

async function bounded<T>(operation: PromiseLike<T>, timeoutMs = 60000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([Promise.resolve(operation), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Task-read fixture handshake timed out')), timeoutMs) })]) }
  finally { clearTimeout(timer) }
}

test('task-read fixture deadlines honor an explicit short bound', async () => {
  const started=performance.now()
  await assert.rejects(bounded(new Promise<never>(()=>{}),10),/Task-read fixture handshake timed out/)
  assert.ok(performance.now()-started<5000,'An explicit short deadline must not use the long database default')
})

test('task-read fast statements and policy fallback retain current snapshot boundaries', { skip: !process.env.DATABASE_TEST_URL }, async t => {
  const url = new URL(process.env.DATABASE_TEST_URL!)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  process.env.DATABASE_POOL_MAX = '5'
  const db = getDb(), owner = randomUUID(), member = randomUUID(), outsider = randomUUID(), actors = [owner, member, outsider]
  const company = randomUUID(), section = randomUUID(), resource = randomUUID(), grant = randomUUID(), workspaces: string[] = []
  const denied = (operation: Promise<unknown>) => assert.rejects(operation, { code: 'forbidden' })
  try {
    for (const id of actors) await db`INSERT INTO auth.users(id,email) VALUES (${id},${`${id}@task-read-snapshot.test`})`
    const workspace = await createWorkspaceRecord(owner, { name: 'Task read snapshots' }); workspaces.push(workspace.id)
    await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${workspace.id},${member})`
    await createTaskRecord(owner, workspace.id, { title: 'Original task' })
    await createCompany(owner, { id: company, name: 'Snapshot company', commandId: randomUUID() })
    await createCanvasContainer(owner, { id: section, parentId: company, kind: 'section', name: 'Restricted', mode: 'restricted', commandId: randomUUID() })
    for (const id of [member, outsider]) await addOrganizationMember(owner, { organizationId: company, userId: id, commandId: randomUUID() })

    await t.test('an uncommitted attachment does not change an earlier statement; the next committed read is restricted', async () => {
      let staged!: () => void, release!: () => void
      const stagedSignal = new Promise<void>(resolve => { staged = resolve })
      const releaseSignal = new Promise<void>(resolve => { release = resolve })
      const attaching = db.begin(async tx => withTransactionContext(tx, async () => {
        await attachWorkspace(owner, { resourceId: resource, workspaceId: workspace.id, parentId: section, mode: 'inherit', expectedWorkspaceVersion: workspace.version, confirmMembershipRestriction: true, commandId: randomUUID() })
        // Hold the writer until the bounded readers finish. The old shared 10s
        // deadline could roll back this fixture while those reads were running.
        staged(); await bounded(releaseSignal, 240000)
      }))
      const failed = attaching.then(() => { throw Error('Attachment exited before release') })
      void failed.catch(() => {})
      try {
        await bounded(Promise.race([stagedSignal, failed]))
        assert.equal((await bounded(listTaskRecordsPage(member, workspace.id))).tasks.length, 1)
        assert.equal((await bounded(getTaskAggregates(member, workspace.id))).total, 1)
        await bounded(denied(listTaskRecordsPage(outsider, workspace.id)))
      } finally { release(); await bounded(attaching) }
      await denied(listTaskRecordsPage(member, workspace.id))
      await denied(getTaskAggregates(member, workspace.id))
    })

    await t.test('section read grants allow members and never replace workspace membership', async () => {
      const version = async () => Number((await db`SELECT version FROM canvas_resources WHERE id=${section}`)[0].version)
      await grantCanvasAccess(owner, { id: grant, resourceId: section, expectedVersion: await version(), principal: { kind: 'user', id: member }, capabilities: ['read'], commandId: randomUUID() })
      await grantCanvasAccess(owner, { id: randomUUID(), resourceId: section, expectedVersion: await version(), principal: { kind: 'user', id: outsider }, capabilities: ['read'], commandId: randomUUID() })
      assert.equal((await listTaskRecordsPage(member, workspace.id)).tasks.length, 1)
      assert.equal((await getTaskAggregates(member, workspace.id)).total, 1)
      await denied(listTaskRecordsPage(outsider, workspace.id))
      await denied(getTaskAggregates(outsider, workspace.id))
    })

    await t.test('policy is re-read when a grant is revoked after attachment detection and before fallback', async () => {
      const originalBegin = db.begin
      type ReadBegin = (options: string, callback: (tx: Transaction) => Promise<unknown>) => Promise<unknown>
      const begin = originalBegin as unknown as ReadBegin
      for (const read of [() => listTaskRecordsPage(member, workspace.id), () => getTaskAggregates(member, workspace.id)]) {
        let entered = 0
        db.begin = ((options: string, operation: (tx: Transaction) => Promise<unknown>) => {
          entered++
          return (async () => {
            await db`UPDATE canvas_resource_grants SET revoked_at=clock_timestamp() WHERE id=${grant}`
            return begin.call(db, options, operation)
          })()
        }) as typeof db.begin
        try { await denied(read()); assert.equal(entered, 1) }
        finally { db.begin = originalBegin; await db`UPDATE canvas_resource_grants SET revoked_at=NULL WHERE id=${grant}` }
      }
    })

    await t.test('active transaction reads see uncommitted work and retain rollback boundaries', async () => {
      const legacy = await createWorkspaceRecord(owner, { name: 'Nested task reads' }); workspaces.push(legacy.id)
      await createTaskRecord(owner, legacy.id, { title: 'Committed task' })
      const rollback = Error('Owned rollback sentinel')
      await assert.rejects(db.begin(async tx => withTransactionContext(tx, async () => {
        await createTaskRecord(owner, legacy.id, { title: 'Uncommitted task' })
        assert.equal((await listTaskRecordsPage(owner, legacy.id)).tasks.length, 2)
        assert.equal((await getTaskAggregates(owner, legacy.id)).total, 2)
        throw rollback
      })), error => error === rollback)
      assert.equal((await listTaskRecordsPage(owner, legacy.id)).tasks.length, 1)
      assert.equal((await getTaskAggregates(owner, legacy.id)).total, 1)
    })
  } finally {
    try {
      await db`DELETE FROM outbox_events WHERE workspace_id=ANY(${db.array(workspaces, 2950)})`
      await db`DELETE FROM activity_events WHERE workspace_id=ANY(${db.array(workspaces, 2950)})`
      await db`DELETE FROM workspaces WHERE id=ANY(${db.array(workspaces, 2950)})`
      await db`DELETE FROM canvas_access_commands WHERE actor_user_id=ANY(${db.array(actors, 2950)})`
      await db`DELETE FROM canvas_access_events WHERE actor_user_id=ANY(${db.array(actors, 2950)})`
      await db`DELETE FROM canvas_resources WHERE organization_id=${company}`
      await db`DELETE FROM profiles WHERE id=ANY(${db.array(actors, 2950)})`
      await db`DELETE FROM auth.users WHERE id=ANY(${db.array(actors, 2950)})`
      assert.equal((await db`SELECT id FROM auth.users WHERE id=ANY(${db.array(actors, 2950)})`).length, 0)
    } finally { await db.end() }
  }
})
