import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import postgres from "postgres"

const connection = process.env.DATABASE_TEST_URL
const rollback = new Error("rollback test fixture")

test("PostgreSQL schema invariants", { skip: !connection }, async t => {
  const sql = postgres(connection!, { max: 1 })
  const fixture = async (check: (tx: postgres.TransactionSql, owner: string, outsider: string, workspace: string) => Promise<void>) => {
    try {
      await sql.begin(async tx => {
        const owner = randomUUID(), outsider = randomUUID(), workspace = randomUUID()
        await tx`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
          (${owner}, ${owner + "@example.test"}, '{"username":"Owner"}'),
          (${outsider}, ${outsider + "@example.test"}, '{"username":"Other"}')`
        await tx`INSERT INTO workspaces (id, name, owner_user_id) VALUES (${workspace}, 'Test', ${owner})`
        await tx`INSERT INTO workspace_members (workspace_id, user_id) VALUES (${workspace}, ${owner})`
        await tx`SET CONSTRAINTS ALL IMMEDIATE`
        await check(tx, owner, outsider, workspace)
        throw rollback
      })
    } catch (error) { if (error !== rollback) throw error }
  }
  try {
    await t.test("signup creates one bounded profile", () => fixture(async (tx, owner) => {
      const rows = await tx`SELECT username FROM profiles WHERE id = ${owner}`
      assert.equal(rows.length, 1)
      assert.equal(rows[0].username, "Owner")
    }))
    await t.test("duplicate membership rejected", () => fixture(async (tx, owner, _other, workspace) => {
      await assert.rejects(tx.savepoint(async sp => { await sp`INSERT INTO workspace_members (workspace_id,user_id) VALUES (${workspace},${owner})` }), { code: "23505" })
    }))
    await t.test("owner cannot exist without membership", () => fixture(async (tx, owner, _other, workspace) => {
      await assert.rejects(tx.savepoint(async sp => { await sp`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${owner}` }), { code: "23503" })
    }))
    await t.test("task assignee must belong to same workspace", () => fixture(async (tx, owner, outsider, workspace) => {
      await assert.rejects(tx.savepoint(async sp => {
        await sp`INSERT INTO tasks (id,workspace_id,title,assignee_user_id,created_by_user_id) VALUES (${randomUUID()},${workspace},'Task',${outsider},${owner})`
      }), { code: "23503" })
    }))
    await t.test("only one pending invitation per normalized recipient", () => fixture(async (tx, owner, _other, workspace) => {
      await tx`INSERT INTO workspace_invitations (id,workspace_id,inviter_user_id,invitee_email,expires_at)
        VALUES (${randomUUID()},${workspace},${owner},'recipient@example.test',now() + interval '1 day')`
      await assert.rejects(tx.savepoint(async sp => {
        await sp`INSERT INTO workspace_invitations (id,workspace_id,inviter_user_id,invitee_email,expires_at)
          VALUES (${randomUUID()},${workspace},${owner},'recipient@example.test',now() + interval '1 day')`
      }), { code: "23505" })
    }))
    await t.test("stale version cannot overwrite workspace", () => fixture(async (tx, _owner, _other, workspace) => {
      await tx`UPDATE workspaces SET name='First edit',version=version+1 WHERE id=${workspace} AND version=1`
      const second = await tx`UPDATE workspaces SET name='Stale edit',version=version+1 WHERE id=${workspace} AND version=1 RETURNING id`
      assert.equal(second.length, 0)
      assert.equal((await tx`SELECT name FROM workspaces WHERE id=${workspace}`)[0].name, "First edit")
    }))
    await t.test("failed mutation rolls back its activity and outbox", async () => {
      const id = randomUUID(), actor = randomUUID(), workspace = randomUUID()
      await assert.rejects(sql.begin(async tx => {
        await tx`INSERT INTO auth.users (id,email) VALUES (${actor},${actor + '@example.test'})`
        await tx`INSERT INTO activity_events(id,workspace_id,actor_user_id,event_type,entity_type,entity_id) VALUES (${id},${workspace},${actor},'test','workspace',${workspace})`
        await tx`INSERT INTO outbox_events(id,workspace_id,event_type,payload) VALUES (${id},${workspace},'test','{}')`
        throw rollback
      }), error => error === rollback)
      assert.equal((await sql`SELECT id FROM activity_events WHERE id=${id}`).length, 0)
      assert.equal((await sql`SELECT id FROM outbox_events WHERE id=${id}`).length, 0)
    })
  } finally { await sql.end() }
})

test("migration leaves browser domain access closed", async () => {
  const migration = await readFile(new URL("../../drizzle/0000_workspace_foundation.sql", import.meta.url), "utf8")
  assert.match(migration, /ALTER TABLE tasks ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON .* FROM anon, authenticated/)
})
