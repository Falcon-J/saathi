import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { getAssistantGuide } from "./product-guide.ts"

test("describes the exact AI actions available to a user", () => {
  const guide = getAssistantGuide(true)

  assert.equal(guide.availability, "available")
  assert.deepEqual(guide.supportedActionIds, [
    "plan_workspace",
    "summarize_workspace",
    "identify_attention",
    "draft_task",
  ])
  assert.deepEqual(guide.unsupportedActionIds, [
    "autonomous_mutation",
    "manage_members",
    "assign_tasks",
    "store_content",
  ])
})

test("explains disabled availability without hiding the assistant contract", () => {
  const guide = getAssistantGuide(false)

  assert.equal(guide.availability, "not_enabled")
  assert.equal(guide.supportedActionIds.length, 4)
})

test("limits documented Groq context to non-secret workspace planning data", () => {
  const guide = getAssistantGuide(true)

  assert.deepEqual(guide.sharedContextIds, [
    "goal_text",
    "workspace_name",
    "workspace_summary",
    "task_id",
    "task_title",
    "task_description",
    "task_status",
    "task_priority",
    "task_due_date",
    "task_due_at",
  ])
  assert.deepEqual(guide.neverSharedIds, [
    "password",
    "session_cookie",
    "redis_credentials",
    "member_email",
  ])
})

test("guide describes the product boundary without infrastructure jargon", () => {
  const source = readFileSync(path.join(process.cwd(), "app", "guide", "page.tsx"), "utf8")
  assert.match(source, /Your workspace remains the source of truth/)
  assert.match(source, /What the assistant receives/)
  assert.doesNotMatch(source, /PostgreSQL|Redis carries realtime updates|What is shared with Groq/)
})
