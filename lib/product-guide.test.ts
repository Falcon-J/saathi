import assert from "node:assert/strict"
import test from "node:test"
import { getAssistantGuide } from "./product-guide.ts"

test("describes the exact AI actions available to a user", () => {
  const guide = getAssistantGuide(true)

  assert.equal(guide.availability, "available")
  assert.deepEqual(guide.supportedActionIds, [
    "plan_workspace",
    "add_task",
    "complete_task",
    "move_task",
    "rename_workspace",
  ])
  assert.deepEqual(guide.unsupportedActionIds, [
    "delete_content",
    "manage_members",
    "assign_tasks",
    "run_multiple_changes",
  ])
})

test("explains disabled availability without hiding the assistant contract", () => {
  const guide = getAssistantGuide(false)

  assert.equal(guide.availability, "not_enabled")
  assert.equal(guide.supportedActionIds.length, 5)
})

test("limits documented Groq context to non-secret workspace planning data", () => {
  const guide = getAssistantGuide(true)

  assert.deepEqual(guide.sharedContextIds, [
    "goal_text",
    "workspace_id",
    "workspace_name",
    "task_id",
    "task_title",
    "task_status",
    "task_bucket",
  ])
  assert.deepEqual(guide.neverSharedIds, [
    "password",
    "session_cookie",
    "redis_credentials",
    "member_email",
  ])
})
