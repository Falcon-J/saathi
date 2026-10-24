import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord, removeWorkspaceMember } from "./workspaces.ts"
import { createTaskRecord, changeTaskRecord } from "./tasks.ts"
import { getWorkspaceUsage } from "../usage.ts"

test("durable usage is member scoped and counts completion transitions, not edits", { skip: !process.env.DATABASE_TEST_URL }, async () => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  const db = getDb(), owner = randomUUID(), member = randomUUID(), outsider = randomUUID()
  let workspaceId: string | undefined
  try {
    await db`INSERT INTO auth.users(id,email) VALUES (${owner},${owner+'@example.test'}),(${member},${member+'@example.test'}),(${outsider},${outsider+'@example.test'})`
    const workspace = await createWorkspaceRecord(owner, { name: "Usage evidence" })
    workspaceId = workspace.id
    // Supplying a verified actor is part of the required read interface.
    const read = getWorkspaceUsage
    assert.equal(await read(workspace.id, outsider), null)
    assert.deepEqual(await read(workspace.id, owner), { taskCreated: 0, taskCompleted: 0, memberAdded: 0, contributors: 1 })
    await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${workspace.id},${member})`
    let task = await createTaskRecord(member, workspace.id, { title: "Measure transitions" })
    task = await changeTaskRecord(member, task.id, "toggle", {}, task.version)
    task = await changeTaskRecord(member, task.id, "edit", { title: "Edit completed work" }, task.version)
    task = await changeTaskRecord(member, task.id, "toggle", {}, task.version)
    await changeTaskRecord(member, task.id, "toggle", {}, task.version)
    assert.deepEqual(await read(workspace.id, member), { taskCreated: 1, taskCompleted: 2, memberAdded: 0, contributors: 2 })
    await removeWorkspaceMember(owner, workspace.id, member+'@example.test')
    assert.equal(await read(workspace.id, member), null)
    assert.equal(await read(randomUUID(), owner), null)
  } finally {
    if (workspaceId) {
      await db`DELETE FROM workspaces WHERE id=${workspaceId}`
      await db`DELETE FROM outbox_events WHERE workspace_id=${workspaceId}`
      await db`DELETE FROM activity_events WHERE workspace_id=${workspaceId}`
    }
    await db`DELETE FROM profiles WHERE id IN (${owner},${member},${outsider})`
    await db`DELETE FROM auth.users WHERE id IN (${owner},${member},${outsider})`
    await db.end()
  }
})
