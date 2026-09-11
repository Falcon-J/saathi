import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord } from "./workspaces.ts"
import { recordAiOperation } from "./ai-operations.ts"

test("AI operation migration stores operational metadata only", async () => {
  const migration = await readFile(new URL("../../drizzle/0004_ai_operation_logs.sql", import.meta.url), "utf8")
  assert.match(migration, /ALTER TABLE ai_operation_logs ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON ai_operation_logs FROM anon, authenticated/)
  assert.doesNotMatch(migration, /\b(prompt|response|task_id|tokens|model_message)\b/i)
})

test("rejects invalid AI operation metadata before database access", async () => {
  await assert.rejects(recordAiOperation(randomUUID(), randomUUID(), {
    capability: "delete_task" as never,
    outcome: "success",
    latencyMs: 20,
    estimatedCostMicros: 10,
  }), /invalid/i)
})

test("records operational AI metadata only for workspace members", { skip: !process.env.DATABASE_TEST_URL }, async () => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  const db = getDb()
  const owner = randomUUID()
  const outsider = randomUUID()
  const ownerEmail = `${owner}@example.test`
  const outsiderEmail = `${outsider}@example.test`
  await db`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (${owner}, ${ownerEmail}, '{"username":"Owner"}'),
    (${outsider}, ${outsiderEmail}, '{"username":"Other"}')`
  const workspace = await createWorkspaceRecord(owner, { name: "AI metadata" })

  try {
    await recordAiOperation(owner, workspace.id, {
      capability: "draft_task",
      outcome: "success",
      latencyMs: 120,
      estimatedCostMicros: 400,
    })

    const rows = await db`SELECT workspace_id, requesting_user_id, capability, outcome, latency_ms, estimated_cost_micros
      FROM ai_operation_logs WHERE workspace_id=${workspace.id}`
    assert.deepEqual(rows.map(row => ({
      workspaceId: row.workspace_id,
      requestingUserId: row.requesting_user_id,
      capability: row.capability,
      outcome: row.outcome,
      latencyMs: row.latency_ms,
      estimatedCostMicros: row.estimated_cost_micros,
    })), [{
      workspaceId: workspace.id,
      requestingUserId: owner,
      capability: "draft_task",
      outcome: "success",
      latencyMs: 120,
      estimatedCostMicros: 400,
    }])
    await assert.rejects(recordAiOperation(outsider, workspace.id, {
      capability: "summarize_workspace",
      outcome: "success",
      latencyMs: 10,
      estimatedCostMicros: 1,
    }), /access denied/i)
  } finally {
    await db`DELETE FROM workspaces WHERE id=${workspace.id}`
    await db`DELETE FROM outbox_events WHERE payload->>'userId' IN (${owner},${outsider})`
    await db`DELETE FROM activity_events WHERE actor_user_id IN (${owner},${outsider})`
    await db`DELETE FROM profiles WHERE id IN (${owner},${outsider})`
    await db`DELETE FROM auth.users WHERE id IN (${owner},${outsider})`
    await db.end()
  }
})
