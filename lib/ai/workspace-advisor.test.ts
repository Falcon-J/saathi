import assert from "node:assert/strict"
import test from "node:test"
import { buildAdvisorProjection, parseAdvisorResponse } from "./workspace-advisor.ts"

test("accepts a reviewed task draft only for the draft-task capability", () => {
  const response = parseAdvisorResponse({
    capability: "draft_task",
    answer: "Here is a small next step.",
    attention: [],
    draft: {
      title: "Review the launch checklist",
      description: "Confirm the release checks before sharing the build.",
      priority: "high",
      dueDate: null,
      dueAt: null,
      estimatedMinutes: 30,
    },
  })

  assert.equal(response.draft?.title, "Review the launch checklist")
})

test("rejects an AI proposal that attempts an unsupported mutation", () => {
  assert.throws(() => parseAdvisorResponse({
    capability: "draft_task",
    answer: "Delete the old task.",
    attention: [],
    draft: { action: "delete_task" },
  }), /invalid/i)
})

test("builds a minimum task projection without server-owned fields", () => {
  const projection = buildAdvisorProjection({
    name: "Launch",
    summary: "Ship the first release",
    tasks: [{
      id: "task-1",
      title: "Ship",
      description: "Release the build",
      status: "todo",
      priority: "high",
      dueDate: null,
      dueAt: null,
      assigneeEmail: "member@example.com",
      createdBy: "owner@example.com",
      version: 3,
    }],
  })

  assert.deepEqual(projection, {
    workspace: { name: "Launch", summary: "Ship the first release" },
    tasks: [{
      id: "task-1",
      title: "Ship",
      description: "Release the build",
      status: "todo",
      priority: "high",
      dueDate: null,
      dueAt: null,
      assigneeEmail: "member@example.com",
    }],
  })
  assert.equal("version" in projection.tasks[0], false)
  assert.equal("createdBy" in projection.tasks[0], false)
})
