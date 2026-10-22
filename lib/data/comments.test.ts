import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord } from "./workspaces.ts"
import { createTaskRecord } from "./tasks.ts"
import { createTaskComment, listTaskComments, listTaskCommentsPage } from "./comments.ts"
import { listActivityEvents, listActivityEventsPage } from "./activity.ts"
import { archiveWorkspaceRecord, removeWorkspaceMember } from "./workspaces.ts"

test("task comments require membership and create one durable activity event", { skip: !process.env.DATABASE_TEST_URL }, async t => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  const db = getDb()
  const owner = { id: randomUUID(), email: `${randomUUID()}@example.test` }
  const member = { id: randomUUID(), email: `${randomUUID()}@example.test` }
  const outsider = { id: randomUUID(), email: `${randomUUID()}@example.test` }
  await db`INSERT INTO auth.users (id, email) VALUES (${owner.id}, ${owner.email})`
  const workspace = await createWorkspaceRecord(owner.id, { name: "Comments" })

  try {
    await db`INSERT INTO auth.users (id, email) VALUES (${member.id}, ${member.email}), (${outsider.id}, ${outsider.email})`
    await db`INSERT INTO workspace_members (workspace_id, user_id) VALUES (${workspace.id}, ${member.id})`
    const task = await createTaskRecord(owner.id, workspace.id, { title: "Review the brief" })

    await assert.rejects(
      createTaskComment(outsider.id, task.id, "I should not see this"),
      /access denied/i,
    )

    const comment = await createTaskComment(member.id, task.id, "The brief is ready for review.")
    assert.equal(comment.body, "The brief is ready for review.")
    assert.equal(comment.authorEmail, member.email)
    assert.equal((await listTaskComments(member.id, task.id)).length, 1)
    assert.equal((await db`SELECT id FROM activity_events WHERE entity_id=${comment.id} AND event_type='task-comment-created'`).length, 1)
    await t.test("comment list preserves full projections and deterministic order in three queries", async () => {
      const next = await createTaskComment(owner.id, task.id, "Owner context")
      await db`UPDATE task_comments SET created_at='2026-10-04T00:00:00Z' WHERE task_id=${task.id}`
      const originalBegin = db.begin
      let queries = 0
      db.begin = ((options: string, callback: (tx: unknown) => unknown) => originalBegin.call(db, options, async (tx: unknown) => callback(new Proxy(tx as object, {
        apply(target, thisArg, args) { queries++; return Reflect.apply(target as (...args: unknown[]) => unknown, thisArg, args) },
      })))) as typeof db.begin
      let listed
      try { listed = await listTaskComments(member.id, task.id) } finally { db.begin = originalBegin }
      assert.equal(queries, 3, "task lookup, membership check and one joined projection")
      assert.deepEqual(listed.map(row => row.id), [comment.id, next.id].sort())
      assert.equal(listed.find(row => row.id === comment.id)?.authorEmail, member.email)
      assert.equal(listed.find(row => row.id === next.id)?.body, "Owner context")
      assert.ok(listed.every(row => row.workspaceId === workspace.id && row.taskId === task.id && row.createdAt === "2026-10-04T00:00:00.000Z"))
      const emptyTask = await createTaskRecord(owner.id, workspace.id, { title: "No discussion yet" })
      assert.deepEqual(await listTaskComments(member.id, emptyTask.id), [])
    })
    await t.test("comment pages traverse ties without repeats and reject foreign cursors", async () => {
      const full = await listTaskComments(member.id, task.id)
      const first = await listTaskCommentsPage(member.id, task.id, undefined, 1)
      assert.deepEqual(first.comments.map(row => row.id), [full[1].id])
      assert.equal(first.nextCursor, full[1].id)
      const second = await listTaskCommentsPage(member.id, task.id, first.nextCursor!, 1)
      assert.deepEqual(second.comments.map(row => row.id), [full[0].id])
      assert.equal(second.nextCursor, null)
      await assert.rejects(listTaskCommentsPage(outsider.id, task.id), /access denied/i)
      await assert.rejects(listTaskCommentsPage(member.id, task.id, randomUUID()), /cursor unavailable/)
      await assert.rejects(listTaskCommentsPage(member.id, task.id, "bad"), /Invalid comment cursor/)
      await assert.rejects(listTaskCommentsPage(member.id, task.id, undefined, 101), /page size/)
    })
    await t.test("more than 100 tied comments traverse completely and cursors cannot cross tasks", async () => {
      const pagedTask = await createTaskRecord(owner.id, workspace.id, { title: "Large discussion" })
      const ids = Array.from({ length: 137 }, () => randomUUID())
      const fixtures = ids.map(id => ({ id, workspace_id: workspace.id, task_id: pagedTask.id,
        author_user_id: owner.id, body: "Retained context", created_at: "2026-10-04T00:00:00.123456Z" }))
      await db`INSERT INTO task_comments ${db(fixtures)}`
      const seen: string[] = []
      let cursor: string | undefined
      let pages = 0
      do {
        const page = await listTaskCommentsPage(member.id, pagedTask.id, cursor)
        assert.ok(page.comments.length <= 50)
        seen.push(...page.comments.map(row => row.id).reverse())
        cursor = page.nextCursor ?? undefined
        pages++
      } while (cursor)
      assert.equal(pages, 3)
      assert.equal(new Set(seen).size, 137)
      assert.deepEqual(seen, ids.sort().reverse())
      await assert.rejects(listTaskCommentsPage(member.id, task.id, ids[0]), /cursor unavailable/)
      await assert.rejects(listTaskCommentsPage(member.id, pagedTask.id, comment.id), /cursor unavailable/)
    })
    await t.test("activity pages preserve microsecond order and reject foreign cursors", async () => {
      const ids = Array.from({ length: 137 }, () => randomUUID())
      await db`INSERT INTO activity_events ${db(ids.map(id => ({ id, workspace_id: workspace.id,
        actor_user_id: owner.id, event_type: "history-fixture", entity_type: "workspace", entity_id: workspace.id })))}`
      // Timestamp parameters use JavaScript Date precision; SQL literals retain microseconds.
      await db`UPDATE activity_events SET created_at='2030-10-04T00:00:00.123456Z' WHERE id IN ${db(ids.slice(0, 80))}`
      await db`UPDATE activity_events SET created_at='2030-10-04T00:00:00.123455Z' WHERE id IN ${db(ids.slice(80))}`
      const storedTimes = await db`SELECT DISTINCT created_at::text AS precise_time FROM activity_events
        WHERE workspace_id=${workspace.id} AND event_type='history-fixture' ORDER BY precise_time DESC`
      assert.deepEqual(storedTimes.map(row => row.precise_time), ["2030-10-04 00:00:00.123456+00", "2030-10-04 00:00:00.123455+00"])
      const seen: string[] = []
      let cursor: string | undefined
      do {
        const page = await listActivityEventsPage(member.id, workspace.id, cursor)
        assert.ok(page.events.length <= 50)
        seen.push(...page.events.map(row => row.id))
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      assert.deepEqual(seen.slice(0, 137), [...ids.slice(0, 80).sort().reverse(), ...ids.slice(80).sort().reverse()])
      assert.equal(new Set(seen).size, seen.length)
      const otherWorkspace = await createWorkspaceRecord(owner.id, { name: "Foreign history" })
      try {
        await assert.rejects(listActivityEventsPage(owner.id, otherWorkspace.id, ids[0]), /cursor unavailable/i)
      } finally { await db`DELETE FROM workspaces WHERE id=${otherWorkspace.id}` }
      await assert.rejects(listActivityEventsPage(member.id, workspace.id, randomUUID()), /cursor unavailable/i)
      await assert.rejects(listActivityEventsPage(member.id, workspace.id, "bad"), /Invalid activity cursor/)
      await assert.rejects(listActivityEventsPage(member.id, workspace.id, undefined, 101), /page size/)
      assert.equal((await listActivityEvents(member.id, workspace.id, 2)).length, 2)
    })
    await t.test("archived discussion and activity remain readable but cannot be changed", async () => {
      await archiveWorkspaceRecord(owner.id, workspace.id, workspace.version)
      assert.equal((await listTaskComments(member.id, task.id)).length, 2)
      assert.ok((await listActivityEvents(member.id, workspace.id, 100)).length > 0)
      const first = await listActivityEventsPage(member.id, workspace.id)
      assert.ok(first.nextCursor)
      assert.ok((await listActivityEventsPage(member.id, workspace.id, first.nextCursor!)).events.length > 0)
      let cursor: string | null = first.nextCursor
      const archivedEvents = [...first.events]
      while (cursor) {
        const page = await listActivityEventsPage(member.id, workspace.id, cursor)
        archivedEvents.push(...page.events)
        cursor = page.nextCursor
      }
      assert.ok(archivedEvents.some(event => event.entityId === comment.id))
      await assert.rejects(createTaskComment(member.id, task.id, "Archived write"), /access denied/i)
      await assert.rejects(listTaskComments(outsider.id, task.id), /access denied/i)
      await assert.rejects(listActivityEvents(outsider.id, workspace.id), /access denied/i)
      await assert.rejects(listActivityEventsPage(outsider.id, workspace.id, first.nextCursor!), /access denied/i)
      await assert.rejects(removeWorkspaceMember(owner.id, workspace.id, member.email), /Archived workspaces/)
    })
    await t.test("removed members lose comment reads and writes", async () => {
      const active = await createWorkspaceRecord(owner.id, { name: "Removal fixture" })
      try {
        await db`INSERT INTO workspace_members (workspace_id,user_id) VALUES (${active.id},${member.id})`
        const activeTask = await createTaskRecord(owner.id, active.id, { title: "Active discussion" })
        const retained = await createTaskComment(member.id, activeTask.id, "Retained context")
        await createTaskComment(owner.id, activeTask.id, "Latest context")
        const first = await listTaskCommentsPage(member.id, activeTask.id, undefined, 1)
        const activityFirst = await listActivityEventsPage(member.id, active.id, undefined, 1)
        assert.ok(activityFirst.nextCursor)
        assert.ok(first.nextCursor)
        await removeWorkspaceMember(owner.id, active.id, member.email)
        await assert.rejects(listTaskComments(member.id, activeTask.id), /access denied/i)
        await assert.rejects(listTaskCommentsPage(member.id, activeTask.id, first.nextCursor!), /access denied/i)
        await assert.rejects(listActivityEventsPage(member.id, active.id, activityFirst.nextCursor!), /access denied/i)
        assert.equal((await listTaskCommentsPage(owner.id, activeTask.id, first.nextCursor!, 1)).comments[0].id, retained.id)
        await assert.rejects(createTaskComment(member.id, activeTask.id, "Removed write"), /access denied/i)
        assert.equal((await listTaskComments(owner.id, activeTask.id)).length, 2)
      } finally { await db`DELETE FROM workspaces WHERE id=${active.id}` }
    })
  } finally {
    await db`DELETE FROM workspaces WHERE id=${workspace.id}`
    await db`DELETE FROM outbox_events WHERE payload->>'userId' IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM activity_events WHERE actor_user_id IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM profiles WHERE id IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM auth.users WHERE id IN (${owner.id},${member.id},${outsider.id})`
    await db.end()
  }
})
