import assert from "node:assert/strict"
import test from "node:test"
import {
  parseWorkspaceCommand,
  parseWorkspacePlan,
  workspaceCommandJsonSchema,
  workspacePlanJsonSchema,
} from "./workspace-intent.ts"

const validPlan = {
  title: "Backend Interview Prep",
  summary: "Prepare for a backend interview over the next three weeks.",
  targetDate: "2026-09-24",
  tasks: [
    { title: "Solve two-pointer problems", bucket: "today", estimatedMinutes: 45, dueDate: null },
    { title: "Review project architecture", bucket: "today", estimatedMinutes: 30, dueDate: null },
    { title: "Revise Redis", bucket: "next", estimatedMinutes: 30, dueDate: "2026-09-10" },
  ],
}

test("accepts a small actionable workspace plan", () => {
  assert.deepEqual(parseWorkspacePlan(validPlan), validPlan)
})

test("rejects plans that are too large or contain impossible dates", () => {
  assert.throws(() => parseWorkspacePlan({
    ...validPlan,
    tasks: Array.from({ length: 9 }, (_, index) => ({
      title: `Task ${index + 1}`,
      bucket: "next",
      estimatedMinutes: null,
      dueDate: null,
    })),
  }))
  assert.throws(() => parseWorkspacePlan({ ...validPlan, targetDate: "2026-02-31" }))
})

test("rejects extra model-owned fields before persistence", () => {
  assert.throws(() => parseWorkspacePlan({ ...validPlan, ownerEmail: "person@example.com" }))
})

test("accepts only the four supported command mutations and unsupported", () => {
  assert.deepEqual(parseWorkspaceCommand({
    action: "complete_task",
    taskId: "task:123",
    taskTitle: null,
    newTitle: null,
    bucket: null,
    dueDate: null,
  }), {
    action: "complete_task",
    taskId: "task:123",
    taskTitle: null,
    newTitle: null,
    bucket: null,
    dueDate: null,
  })

  assert.deepEqual(parseWorkspaceCommand({
    action: "unsupported",
    taskId: null,
    taskTitle: null,
    newTitle: null,
    bucket: null,
    dueDate: null,
  }).action, "unsupported")
  assert.throws(() => parseWorkspaceCommand({ action: "delete_workspace" }))
})

test("exports strict JSON schemas matching the local validators", () => {
  assert.equal(workspacePlanJsonSchema.additionalProperties, false)
  assert.equal(workspacePlanJsonSchema.properties.tasks.minItems, 3)
  assert.equal(workspacePlanJsonSchema.properties.tasks.maxItems, 8)
  assert.deepEqual(workspaceCommandJsonSchema.properties.action.enum, [
    "complete_task",
    "add_task",
    "move_task",
    "rename_workspace",
    "unsupported",
  ])
})
