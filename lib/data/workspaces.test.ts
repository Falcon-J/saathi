import test from "node:test"
import assert from "node:assert/strict"
import { validateWorkspace } from "./workspaces.ts"
import { flushOutbox } from "./events.ts"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { archiveWorkspaceRecord, createWorkspaceRecord, deleteWorkspaceRecord, listWorkspaces, readWorkspace, removeWorkspaceMember, transferWorkspaceOwnershipRecord, updateWorkspaceRecord } from "./workspaces.ts"

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
    await t.test("workspace listing uses two statements regardless of workspace count", async () => {
      const second = await createWorkspaceRecord(owner, { name: "Second workspace" })
      workspaceIds.push(second.id)
      const begin = db.begin
      let queries = 0
      db.begin = ((options: string, callback: (tx: unknown) => unknown) => begin.call(db, options, async (tx: unknown) => callback(new Proxy(tx as object, {
        apply(target, thisArg, args) { if (args[0]?.raw) queries++; return Reflect.apply(target as (...args: unknown[]) => unknown, thisArg, args) },
      })))) as typeof db.begin
      let listed
      try { listed = await listWorkspaces(owner) } finally { db.begin = begin }
      assert.equal(queries, 2)
      assert.equal(listed.length, 2)
      assert.ok(listed.every(item => item.members[0].userId === owner))
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
        await flushOutbox(saved.id)
        const pending = await db`SELECT published_at,attempt_count FROM outbox_events WHERE workspace_id=${saved.id}`
        assert.equal(pending[0].published_at, null)
        assert.equal(pending[0].attempt_count, 1)
      } finally { realtimeService.publishEvent = publish }
    })
    await t.test("ownership transfer requires membership and version and preserves one owner", async () => {
      const transfer = await createWorkspaceRecord(owner, { name: "Transfer evidence" })
      workspaceIds.push(transfer.id)
      await assert.rejects(transferWorkspaceOwnershipRecord(owner, transfer.id, member, transfer.version), /already be a workspace member/)
      await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${transfer.id},${member})`
      await assert.rejects(transferWorkspaceOwnershipRecord(member, transfer.id, owner, transfer.version), /Only workspace owner/)
      await assert.rejects(transferWorkspaceOwnershipRecord(owner, transfer.id, member, 0), /invalid/)
      await assert.rejects(transferWorkspaceOwnershipRecord(owner, transfer.id, member, transfer.version + 1), /changed/)
      await transferWorkspaceOwnershipRecord(owner, transfer.id, member, transfer.version)
      const saved = (await readWorkspace(transfer.id, member))!
      assert.equal(saved.ownerUserId, member)
      assert.equal(saved.version, transfer.version + 1)
      assert.equal(saved.members.filter(person => person.role === "owner").length, 1)
      assert.equal(saved.members.find(person => person.userId === owner)?.role, "member")
      await assert.rejects(updateWorkspaceRecord(owner, transfer.id, { name: "Former owner write" }, saved.version), /Only workspace owner/)
      await archiveWorkspaceRecord(member, transfer.id, saved.version)
      assert.ok(!(await listWorkspaces(owner)).some(item => item.id === transfer.id))
      const retained = (await listWorkspaces(owner, true)).find(item => item.id === transfer.id)
      assert.ok(retained, "archived workspaces remain discoverable to current members")
      assert.ok("archivedAt" in retained && retained.archivedAt)
      assert.deepEqual(await listWorkspaces(randomUUID(), true), [])
      await assert.rejects(transferWorkspaceOwnershipRecord(member, transfer.id, owner, saved.version + 1), /Archived workspaces/)
      await assert.rejects(removeWorkspaceMember(member, transfer.id, `${owner}@example.test`), /Archived workspaces/)
      await assert.rejects(deleteWorkspaceRecord(member, transfer.id), /Archived workspaces/)
      assert.equal((await readWorkspace(transfer.id, owner))!.members.length, 2)
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
