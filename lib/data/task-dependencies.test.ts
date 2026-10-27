import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { getDb, type Transaction } from "../db/client.ts"
import { createWorkspaceRecord, deleteWorkspaceRecord, removeWorkspaceMember } from "./workspaces.ts"
import { changeTaskRecord, createTaskRecord } from "./tasks.ts"
import { changeTaskPrerequisite, readTaskGraph, type PrerequisiteCommand } from "./task-dependencies.ts"

test("dependency migration keeps endpoints in one workspace and browser access closed", async () => {
  const sql = await readFile(new URL("../../drizzle/0008_task_dependencies.sql", import.meta.url), "utf8")
  assert.match(sql, /UNIQUE INDEX tasks_workspace_id_unique ON tasks \(workspace_id, id\)/)
  assert.match(sql, /FOREIGN KEY \(workspace_id, dependent_task_id\) REFERENCES tasks\(workspace_id, id\)/)
  assert.match(sql, /FOREIGN KEY \(workspace_id, prerequisite_task_id\) REFERENCES tasks\(workspace_id, id\)/)
  assert.match(sql, /CHECK \(dependent_task_id <> prerequisite_task_id\)/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON task_dependencies FROM anon, authenticated/)
})

test("dependency commands reject malformed input before connecting", async () => {
  await assert.rejects(changeTaskPrerequisite("actor", {} as PrerequisiteCommand), /Invalid prerequisite command/)
  await assert.rejects(readTaskGraph("actor", "bad"), /Invalid workspace identifier/)
})

test("task prerequisites are authorized, versioned, replay safe and race safe", { skip: !process.env.DATABASE_TEST_URL }, async t => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  process.env.DATABASE_POOL_MAX = "2"
  const db = getDb()
  const owner = { id: randomUUID(), email: `${randomUUID()}@example.test` }
  const member = { id: randomUUID(), email: `${randomUUID()}@example.test` }
  const outsider = { id: randomUUID(), email: `${randomUUID()}@example.test` }
  await db`INSERT INTO auth.users (id,email) VALUES (${owner.id},${owner.email}),(${member.id},${member.email}),(${outsider.id},${outsider.email})`
  const workspace = await createWorkspaceRecord(owner.id, { name: "Prerequisite test" })
  const foreign = await createWorkspaceRecord(owner.id, { name: "Foreign prerequisite" })
  const command = (dependentTaskId: string, prerequisiteTaskId: string, expectedVersion = 1): PrerequisiteCommand => ({
    workspaceId: workspace.id, dependentTaskId, prerequisiteTaskId, expectedVersion, commandId: randomUUID(), operation: "add",
  })
  try {
    await db`INSERT INTO workspace_members (workspace_id,user_id) VALUES (${workspace.id},${member.id})`
    const a = await createTaskRecord(owner.id, workspace.id, { title: "Build API" })
    const b = await createTaskRecord(owner.id, workspace.id, { title: "Connect frontend", assigneeEmail: member.email })
    const other = await createTaskRecord(owner.id, foreign.id, { title: "Other workspace" })
    const add = command(b.id, a.id)
    await t.test("denies outsiders, assignee-only edits, foreign endpoints and self links", async () => {
      await assert.rejects(readTaskGraph(outsider.id, workspace.id), /access denied/)
      await assert.rejects(changeTaskPrerequisite(outsider.id, add), /access denied/)
      await assert.rejects(changeTaskPrerequisite(member.id, add), /Access denied/)
      await assert.rejects(changeTaskPrerequisite(owner.id, command(b.id, other.id)), /unavailable or access denied/)
      await assert.rejects(changeTaskPrerequisite(owner.id, command(a.id, a.id)), /depend on itself/)
    })
    await t.test("one edge, version, activity and outbox commit together; stale/duplicate writes fail", async () => {
      const result = await changeTaskPrerequisite(owner.id, add)
      assert.ok(result.task)
      assert.equal(result.task.version, 2)
      assert.equal(result.replayed, false)
      const graph = await readTaskGraph(member.id, workspace.id)
      assert.equal(graph.tasks.length, 2)
      assert.deepEqual(graph.dependencies, [{ workspaceId: workspace.id, dependentTaskId: b.id, prerequisiteTaskId: a.id }])
      assert.ok(!Number.isNaN(Date.parse(graph.asOf)))
      const events = await db`SELECT id FROM activity_events WHERE entity_id=${b.id} AND metadata->>'action'='dependency-add'`
      assert.equal(events.length, 1)
      assert.equal((await db`SELECT id FROM outbox_events WHERE id=${events[0].id}`).length, 1)
      await assert.rejects(changeTaskPrerequisite(owner.id, command(b.id, a.id)), /changed by another/)
      await assert.rejects(changeTaskPrerequisite(owner.id, command(b.id, a.id, 2)), /already exists/)
      assert.equal((await db`SELECT dependent_task_id FROM task_dependencies WHERE workspace_id=${workspace.id}`).length, 1)
    })
    await t.test("replay after intervening edits returns current task and no duplicate event", async () => {
      const edited = await changeTaskRecord(owner.id, b.id, "edit", { title: "Current frontend" }, 2)
      const replay = await changeTaskPrerequisite(owner.id, add)
      assert.ok(replay.task)
      assert.equal(replay.replayed, true)
      assert.equal(replay.task.version, edited.version)
      assert.equal(replay.task.title, edited.title)
      assert.equal((await db`SELECT id FROM activity_events WHERE entity_id=${b.id} AND metadata->>'action'='dependency-add'`).length, 1)
      await assert.rejects(changeTaskPrerequisite(owner.id, { ...add, operation: "remove" }), /already used/)
    })
    await t.test("rejects cycles and prerequisite deletion, allows explicit removal and workspace cascade", async () => {
      await assert.rejects(changeTaskPrerequisite(owner.id, command(a.id, b.id)), /cycle/)
      await assert.rejects(changeTaskRecord(owner.id, a.id, "delete", {}, 1), /Other tasks depend/)
      const removal = await changeTaskPrerequisite(owner.id, { ...command(b.id, a.id, 3), operation: "remove" })
      assert.ok(removal.task)
      assert.equal(removal.task.version, 4)
      await changeTaskRecord(owner.id, a.id, "delete", {}, 1)
      assert.equal((await readTaskGraph(owner.id, workspace.id)).dependencies.length, 0)
    })
    await t.test("schema rejects foreign endpoints and self edges", async () => {
      await assert.rejects(db`INSERT INTO task_dependencies (workspace_id,dependent_task_id,prerequisite_task_id,created_by_user_id)
        VALUES (${workspace.id},${b.id},${other.id},${owner.id})`, { code: "23503" })
      await assert.rejects(db`INSERT INTO task_dependencies (workspace_id,dependent_task_id,prerequisite_task_id,created_by_user_id)
        VALUES (${workspace.id},${b.id},${b.id},${owner.id})`, { code: "23514" })
    })
    await t.test("a lost command result remains recoverable after another actor deletes its task", async () => {
      const prerequisite = await createTaskRecord(owner.id, workspace.id, { title: "Retained prerequisite" })
      const dependent = await createTaskRecord(member.id, workspace.id, { title: "Deleted private fixture title" })
      const originalCommand = command(dependent.id, prerequisite.id)
      await changeTaskPrerequisite(member.id, originalCommand)
      const removal = await changeTaskPrerequisite(owner.id, { ...command(dependent.id, prerequisite.id, 2), operation: "remove" })
      assert.ok(removal.task)
      await changeTaskRecord(owner.id, dependent.id, "delete", {}, removal.task.version)
      const replay = await changeTaskPrerequisite(member.id, originalCommand)
      assert.deepEqual(replay, { replayed: true })
      assert.doesNotMatch(JSON.stringify(replay), /Deleted private fixture title/)
      assert.equal((await db`SELECT id FROM activity_events WHERE entity_id=${dependent.id} AND metadata->>'action'='dependency-add'`).length, 1)
      await removeWorkspaceMember(owner.id, workspace.id, member.email)
      await assert.rejects(changeTaskPrerequisite(member.id, originalCommand), /access denied/)
      await db`INSERT INTO workspace_members (workspace_id,user_id) VALUES (${workspace.id},${member.id})`
    })
    await t.test("opposite links from two independent transactions cannot both commit", async () => {
      const c = await createTaskRecord(owner.id, workspace.id, { title: "Race C" })
      const d = await createTaskRecord(owner.id, workspace.id, { title: "Race D" })
      const originalBegin = db.begin
      const runBegin = originalBegin as unknown as (callback: (tx: Transaction) => Promise<unknown>) => Promise<unknown>
      const pids = new Set<number>()
      let entered = 0, release!: () => void
      const bothEntered = new Promise<void>(resolve => { release = resolve })
      db.begin = ((callback: (tx: Transaction) => Promise<unknown>) => runBegin.call(db, async tx => {
        const [pid] = await tx`SELECT pg_backend_pid() AS pid`
        pids.add(pid.pid)
        if (++entered === 2) release()
        await bothEntered
        return callback(tx)
      })) as typeof db.begin
      let results: PromiseSettledResult<unknown>[]
      try { results = await Promise.allSettled([
        changeTaskPrerequisite(owner.id, command(c.id, d.id)), changeTaskPrerequisite(owner.id, command(d.id, c.id)),
      ]) } finally { db.begin = originalBegin }
      assert.equal(pids.size, 2, "race test requires two distinct backend connections")
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1)
      const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult
      assert.match(rejected.reason.message, /cycle/)
      assert.equal((await readTaskGraph(owner.id, workspace.id)).dependencies.length, 1)
    })
    await t.test("revocation and archive deny fresh access/writes; whole-workspace deletion succeeds", async () => {
      await removeWorkspaceMember(owner.id, workspace.id, member.email)
      await assert.rejects(readTaskGraph(member.id, workspace.id), /access denied/)
      const graph = await readTaskGraph(owner.id, workspace.id)
      assert.ok(graph.dependencies.length)
      const edge = graph.dependencies[0]
      const currentDependent = graph.tasks.find(task => task.id === edge.dependentTaskId)!
      const validCommand = { ...command(edge.dependentTaskId, edge.prerequisiteTaskId, currentDependent.version), operation: "remove" as const }
      await assert.rejects(changeTaskPrerequisite(member.id, validCommand), /access denied/)
      await db`UPDATE workspaces SET archived_at=now() WHERE id=${workspace.id}`
      await assert.rejects(changeTaskPrerequisite(owner.id, validCommand), /access denied/)
      await db`UPDATE workspaces SET archived_at=NULL WHERE id=${workspace.id}`
      await deleteWorkspaceRecord(owner.id, workspace.id)
      assert.equal((await db`SELECT workspace_id FROM task_dependencies WHERE workspace_id=${workspace.id}`).length, 0)
    })
  } finally {
    await db`DELETE FROM workspaces WHERE id IN (${workspace.id},${foreign.id})`
    await db`DELETE FROM activity_events WHERE actor_user_id IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM outbox_events WHERE workspace_id IN (${workspace.id},${foreign.id})`
    await db`DELETE FROM profiles WHERE id IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM auth.users WHERE id IN (${owner.id},${member.id},${outsider.id})`
    await db.end()
  }
})
