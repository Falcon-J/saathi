import assert from "node:assert/strict"
import test from "node:test"
import { hasTaskConflict, normalizeTaskUpdates } from "./contract.ts"

test("normalizes allowed task updates", () => {
  assert.deepEqual(normalizeTaskUpdates({ title: "  Launch flow  ", priority: "high", status: "in-progress" }), {
    updates: { title: "Launch flow", priority: "high", status: "in-progress" },
  })
})

test("accepts the persisted board status values", () => {
  assert.deepEqual(normalizeTaskUpdates({ status: "done" }), {
    updates: { status: "done" },
  })
})

test("accepts execution metadata used by the overview", () => {
  assert.deepEqual(normalizeTaskUpdates({ bucket: "next", estimatedMinutes: 45 }), {
    updates: { bucket: "next", estimatedMinutes: 45 },
  })
})

test("accepts an ISO due time and preserves an estimate", () => {
  assert.deepEqual(normalizeTaskUpdates({ dueAt: "2026-09-15T14:30:00.000Z", estimatedMinutes: 45 }), {
    updates: { dueAt: "2026-09-15T14:30:00.000Z", estimatedMinutes: 45 },
  })
})

test("rejects an invalid due time", () => {
  assert.equal(typeof normalizeTaskUpdates({ dueAt: "tomorrow afternoon" }).error, "string")
})

test("rejects invalid execution metadata", () => {
  assert.equal(typeof normalizeTaskUpdates({ bucket: "later" }).error, "string")
  assert.equal(typeof normalizeTaskUpdates({ estimatedMinutes: 0 }).error, "string")
  assert.equal(typeof normalizeTaskUpdates({ estimatedMinutes: 1441 }).error, "string")
})

test("rejects server-owned task fields", () => {
  const result = normalizeTaskUpdates({ workspaceId: "other-workspace" })
  assert.equal(typeof result.error, "string")
})

test("accepts clearing an assignee", () => {
  assert.deepEqual(normalizeTaskUpdates({ assigneeEmail: null }), {
    updates: { assigneeEmail: undefined },
  })
  assert.deepEqual(normalizeTaskUpdates({ assigneeEmail: undefined }), {
    updates: { assigneeEmail: undefined },
  })
})

test("rejects invalid task input and empty updates", () => {
  assert.equal(typeof normalizeTaskUpdates({ assigneeEmail: "not-an-email" }).error, "string")
  assert.equal(typeof normalizeTaskUpdates({}).error, "string")
})

test("detects a stale task version without requiring a precondition for legacy callers", () => {
  assert.equal(hasTaskConflict("v2", "v1"), true)
  assert.equal(hasTaskConflict("v1", "v1"), false)
  assert.equal(hasTaskConflict("v1"), false)
})
