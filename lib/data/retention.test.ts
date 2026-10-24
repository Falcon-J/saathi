import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord } from "./workspaces.ts"
import { deleteExpiredPublishedOutbox } from "./retention.ts"

test("retention removes old transport copies and preserves pending and recent rows", { skip: !process.env.DATABASE_TEST_URL }, async () => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  const db = getDb()
  const old = randomUUID(), pending = randomUUID(), recent = randomUUID()
  const owner = randomUUID()
  await db`INSERT INTO auth.users (id,email) VALUES (${owner}, ${`${owner}@example.test`})`
  const workspace = await createWorkspaceRecord(owner, { name: "Retention fixture" })
  try {
    await db`INSERT INTO outbox_events (id,workspace_id,event_type,payload,created_at,published_at) VALUES
      (${old},${workspace.id},'test','{}','1999-01-01','1999-01-01'),
      (${pending},${workspace.id},'test','{}','1999-01-01',NULL),
      (${recent},${workspace.id},'test','{}','1999-01-01','2000-02-01')`
    await deleteExpiredPublishedOutbox(new Date('2000-02-02T00:00:00Z'))
    const rows = await db`SELECT id FROM outbox_events WHERE id IN (${old},${pending},${recent})`
    assert.deepEqual(rows.map(row => row.id).sort(), [pending,recent].sort())
  } finally {
    await db`DELETE FROM outbox_events WHERE id IN (${old},${pending},${recent})`
    await db`DELETE FROM workspaces WHERE id=${workspace.id}`
    await db`DELETE FROM outbox_events WHERE payload->>'userId'=${owner}`
    await db`DELETE FROM activity_events WHERE actor_user_id=${owner}`
    await db`DELETE FROM profiles WHERE id=${owner}`
    await db`DELETE FROM auth.users WHERE id=${owner}`
    await db.end()
  }
})
