import test from "node:test"
import assert from "node:assert/strict"
import { validateWorkspace } from "./workspaces.ts"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord, deleteWorkspaceRecord, listWorkspaces, readWorkspace, removeWorkspaceMember, updateWorkspaceRecord } from "./workspaces.ts"

test("workspace input trims text and normalizes target instant", () => {
  assert.deepEqual(validateWorkspace({ name: " Launch ", summary: " Ship v1 ", timezone: "Asia/Kolkata", targetAt: "2026-10-01T12:00:00+05:30" }), {
    name: "Launch", summary: "Ship v1", timezone: "Asia/Kolkata", targetAt: "2026-10-01T06:30:00.000Z",
  })
})
test("workspace input rejects blank or oversized values and unsupported timezone", () => {
  for (const input of [null, [], { name: 17 }, { name: " " }, { name: "x".repeat(101) }, { name: "Valid", summary: "x".repeat(241) },
    { name: "Valid", targetAt: "tomorrow" }, { name: "Valid", timezone: "Mars/Base" }]) {
    assert.throws(() => validateWorkspace(input))
  }
})
test("explicit target removal does not resurrect legacy target date", () => {
  assert.equal(validateWorkspace({ name: "Launch", targetAt: null, targetDate: "2026-10-01" }).targetAt, null)
})

test("workspace domain transactions", { skip: !process.env.DATABASE_TEST_URL }, async t => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  const { realtimeService } = await import("../realtime.ts")
  const db = getDb(), owner = randomUUID(), member = randomUUID()
  const workspaceIds: string[] = []
  const email = `${member}@example.test`
  try {
    await db`INSERT INTO auth.users(id,email) VALUES (${owner},${owner + '@example.test'}),(${member},${email})`
    const workspace = await createWorkspaceRecord(owner, { name: "Release", tasks: [{ title: "Ship", bucket: "today" }] })
    workspaceIds.push(workspace.id)
    await t.test("creation commits owner, tasks, activity, and outbox together", async () => {
      assert.equal(workspace.members[0].userId, owner)
      assert.equal(workspace.ownerUserId, owner)
      assert.equal((await db`SELECT id FROM tasks WHERE workspace_id=${workspace.id}`).length, 1)
      assert.equal((await db`SELECT id FROM activity_events WHERE workspace_id=${workspace.id}`).length, 2)
      assert.equal((await db`SELECT id FROM outbox_events WHERE workspace_id=${workspace.id}`).length, 2)
    })
    await t.test("nonmembers cannot read or change a workspace", async () => {
      assert.equal(await readWorkspace(workspace.id, member), null)
      assert.deepEqual(await listWorkspaces(member), [])
      await assert.rejects(updateWorkspaceRecord(member, workspace.id, { name: "Stolen" }, 1), /Only workspace owner/)
    })
    await t.test("only one concurrent edit with the same expected version succeeds", async () => {
      const outcomes = await Promise.allSettled([
        updateWorkspaceRecord(owner, workspace.id, { name: "First" }, 1),
        updateWorkspaceRecord(owner, workspace.id, { name: "Second" }, 1),
      ])
      assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1)
      assert.equal((await readWorkspace(workspace.id, owner))?.version, 2)
    })
    await t.test("leaving clears assignments and cannot remove the owner", async () => {
      await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${workspace.id},${member})`
      await db`UPDATE tasks SET assignee_user_id=${member} WHERE workspace_id=${workspace.id}`
      await removeWorkspaceMember(member, workspace.id, email)
      assert.equal((await db`SELECT assignee_user_id FROM tasks WHERE workspace_id=${workspace.id}`)[0].assignee_user_id, null)
      assert.equal(await readWorkspace(workspace.id, member), null)
      await assert.rejects(removeWorkspaceMember(owner, workspace.id, `${owner}@example.test`), /Transfer ownership/)
    })
    await t.test("realtime failure leaves committed data and a retryable outbox", async () => {
      const publish = realtimeService.publishEvent
      realtimeService.publishEvent = async () => { throw new Error("Unavailable") }
      try {
        const saved = await createWorkspaceRecord(owner, { name: "Offline delivery" })
        workspaceIds.push(saved.id)
        assert.ok(await readWorkspace(saved.id, owner))
        const pending = await db`SELECT published_at,attempt_count FROM outbox_events WHERE workspace_id=${saved.id}`
        assert.equal(pending[0].published_at, null)
        assert.equal(pending[0].attempt_count, 1)
      } finally { realtimeService.publishEvent = publish }
    })
    await t.test("deletion keeps durable audit and delivery records", async () => {
      await deleteWorkspaceRecord(owner, workspace.id)
      assert.equal(await readWorkspace(workspace.id, owner), null)
      assert.ok((await db`SELECT id FROM activity_events WHERE workspace_id=${workspace.id}`).length > 0)
      assert.ok((await db`SELECT id FROM outbox_events WHERE workspace_id=${workspace.id}`).length > 0)
    })
  } finally {
    for (const id of workspaceIds) {
      await db`DELETE FROM workspaces WHERE id=${id}`
      await db`DELETE FROM activity_events WHERE workspace_id=${id}`
      await db`DELETE FROM outbox_events WHERE workspace_id=${id}`
    }
    await db`DELETE FROM profiles WHERE id IN (${owner},${member})`
    await db`DELETE FROM auth.users WHERE id IN (${owner},${member})`
    await db.end()
  }
})
