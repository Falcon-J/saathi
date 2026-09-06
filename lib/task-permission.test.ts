import assert from "node:assert/strict"
import test from "node:test"
import { canChangeTask, matchesTaskVersion } from "./task-permission.ts"

test("assignees may complete tasks but cannot rewrite or delete them", () => {
  const task = { ownerId: "owner", creatorId: "creator", assigneeId: "assignee" }
  assert.equal(canChangeTask(task, "assignee", "toggle"), true)
  assert.equal(canChangeTask(task, "assignee", "edit"), false)
  assert.equal(canChangeTask(task, "other", "toggle"), false)
  assert.equal(canChangeTask(task, "owner", "delete"), true)
})
test("mutations require an exact version or legacy timestamp, never an omitted precondition", () => {
  assert.equal(matchesTaskVersion(3, "2026-09-05T00:00:00.000Z", undefined), false)
  assert.equal(matchesTaskVersion(3, "2026-09-05T00:00:00.000Z", 2), false)
  assert.equal(matchesTaskVersion(3, "2026-09-05T00:00:00.000Z", 3), true)
  assert.equal(matchesTaskVersion(3, "2026-09-05T00:00:00.000Z", "2026-09-05T00:00:00.000Z"), true)
})
