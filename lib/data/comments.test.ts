import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord } from "./workspaces.ts"
import { createTaskRecord } from "./tasks.ts"
import { createTaskComment, listTaskComments } from "./comments.ts"

test("task comments require membership and create one durable activity event", { skip: !process.env.DATABASE_TEST_URL }, async () => {
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
  } finally {
    await db`DELETE FROM workspaces WHERE id=${workspace.id}`
    await db`DELETE FROM outbox_events WHERE payload->>'userId' IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM activity_events WHERE actor_user_id IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM profiles WHERE id IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM auth.users WHERE id IN (${owner.id},${member.id},${outsider.id})`
    await db.end()
  }
})
