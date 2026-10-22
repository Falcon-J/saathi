import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord } from "./workspaces.ts"
import { createTaskRecord, changeTaskRecord } from "./tasks.ts"
import { createTaskComment } from "./comments.ts"

test("create retries return one committed entity and event, and reject changed input", { skip: !process.env.DATABASE_TEST_URL }, async () => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  const db = getDb(), owner = randomUUID(), outsider = randomUUID()
  await db`INSERT INTO auth.users(id,email) VALUES (${owner},${owner + '@example.test'}),(${outsider},${outsider + '@example.test'})`
  let workspaceId: string | undefined
  try {
    const workspace = await createWorkspaceRecord(owner, { name: "Retry fixture" })
    workspaceId = workspace.id
    const commandId = randomUUID()
    const [first, retry] = await Promise.all([
      createTaskRecord(owner, workspace.id, { title: "One task" }, commandId),
      createTaskRecord(owner, workspace.id, { title: "One task" }, commandId),
    ])
    assert.equal(first.id, retry.id)
    assert.equal((await db`SELECT id FROM activity_events WHERE entity_id=${first.id} AND event_type='task-created'`).length, 1)
    await assert.rejects(createTaskRecord(owner, workspace.id, { title: "Different" }, commandId), /already used/)
    await assert.rejects(createTaskRecord(outsider, workspace.id, { title: "One task" }, commandId), /access denied/)
    const commentCommand = randomUUID()
    const comment = await createTaskComment(owner, first.id, "Hello", commentCommand)
    assert.equal((await createTaskComment(owner, first.id, "Hello", commentCommand)).id, comment.id)
    await assert.rejects(createTaskComment(owner, first.id, "Changed", commentCommand), /already used/)
    assert.equal((await db`SELECT id FROM activity_events WHERE entity_id=${comment.id}`).length, 1)
    await changeTaskRecord(owner, first.id, "delete", {}, first.version)
    // A late retry after deletion must not recreate the entity.
    assert.equal((await createTaskRecord(owner, workspace.id, { title: "One task" }, commandId)).id, first.id)
    assert.equal((await db`SELECT id FROM tasks WHERE id=${first.id}`).length, 0)
    // Receipts remain subject to current membership and workspace state.
    await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${workspace.id},${outsider})`
    const memberTask = await createTaskRecord(outsider, workspace.id, { title: "Member task" }, commandId)
    assert.notEqual(memberTask.id, first.id)
    await db`DELETE FROM workspace_members WHERE workspace_id=${workspace.id} AND user_id=${outsider}`
    await assert.rejects(createTaskRecord(outsider, workspace.id, { title: "Member task" }, commandId), /access denied/)
    await db`UPDATE workspaces SET archived_at=now() WHERE id=${workspace.id}`
    await assert.rejects(createTaskRecord(owner, workspace.id, { title: "One task" }, commandId), /access denied/)
  } finally {
    await db`DELETE FROM activity_events WHERE actor_user_id IN (${owner},${outsider})`
    if (workspaceId) await db`DELETE FROM workspaces WHERE id=${workspaceId}`
    await db`DELETE FROM profiles WHERE id IN (${owner},${outsider})`
    await db`DELETE FROM auth.users WHERE id IN (${owner},${outsider})`
  }
})
