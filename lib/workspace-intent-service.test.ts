import assert from "node:assert/strict"
import test from "node:test"
import type { WorkspaceCommand, WorkspacePlan } from "./workspace-intent.ts"
import { applyWorkspaceCommand, persistWorkspacePlan } from "./workspace-intent-service.ts"

const plan: WorkspacePlan = {
  title: "Backend Interview Prep",
  summary: "Prepare for a backend interview over the next three weeks.",
  targetDate: "2026-09-24",
  tasks: [
    { title: "Practice arrays", bucket: "today", estimatedMinutes: 45, dueDate: null },
    { title: "Review Redis", bucket: "today", estimatedMinutes: 30, dueDate: null },
    { title: "Revise system design", bucket: "next", estimatedMinutes: 60, dueDate: null },
  ],
}

test("persists a generated plan through existing workspace and task boundaries", async () => {
  const added: unknown[] = []
  const workspace = await persistWorkspacePlan(plan, {
    createWorkspace: async (input) => ({ id: "workspace-1", ...input }),
    addTask: async (input) => {
      added.push(input)
      return { id: `task-${added.length}` }
    },
    deleteWorkspace: async () => assert.fail("successful generation must not compensate"),
  })

  assert.deepEqual(workspace, {
    id: "workspace-1",
    name: "Backend Interview Prep",
    summary: plan.summary,
    targetDate: plan.targetDate,
  })
  assert.deepEqual(added[0], {
    workspaceId: "workspace-1",
    title: "Practice arrays",
    dueDate: undefined,
    bucket: "today",
    estimatedMinutes: 45,
  })
  assert.equal(added.length, 3)
})

test("removes the generated workspace when any task cannot be persisted", async () => {
  const deleted: string[] = []
  let attempts = 0

  await assert.rejects(() => persistWorkspacePlan(plan, {
    createWorkspace: async (input) => ({ id: "workspace-1", ...input }),
    addTask: async () => {
      attempts += 1
      if (attempts === 2) throw new Error("task failed")
      return { id: `task-${attempts}` }
    },
    deleteWorkspace: async (workspaceId) => { deleted.push(workspaceId) },
  }), /task failed/)

  assert.deepEqual(deleted, ["workspace-1"])
})

test("applies complete, add, move, and rename commands by stable task ID", async () => {
  const calls: Array<{ kind: string; value: unknown }> = []
  const tasks = [
    { id: "task-redis", title: "Review Redis", status: "todo" as const, bucket: "today" as const },
  ]
  const dependencies = {
    updateTask: async (taskId: string, updates: object) => { calls.push({ kind: "update", value: { taskId, updates } }) },
    addTask: async (input: object) => { calls.push({ kind: "add", value: input }) },
    renameWorkspace: async (workspaceId: string, name: string) => { calls.push({ kind: "rename", value: { workspaceId, name } }) },
  }

  await applyWorkspaceCommand(command({ action: "complete_task", taskId: "task-redis" }), "workspace-1", tasks, dependencies)
  await applyWorkspaceCommand(command({ action: "add_task", taskTitle: "Practice graphs", bucket: "next" }), "workspace-1", tasks, dependencies)
  await applyWorkspaceCommand(command({ action: "move_task", taskId: "task-redis", bucket: "next" }), "workspace-1", tasks, dependencies)
  await applyWorkspaceCommand(command({ action: "rename_workspace", newTitle: "Interview Sprint" }), "workspace-1", tasks, dependencies)

  assert.deepEqual(calls, [
    { kind: "update", value: { taskId: "task-redis", updates: { status: "done" } } },
    { kind: "add", value: { workspaceId: "workspace-1", title: "Practice graphs", dueDate: undefined, bucket: "next" } },
    { kind: "update", value: { taskId: "task-redis", updates: { bucket: "next" } } },
    { kind: "rename", value: { workspaceId: "workspace-1", name: "Interview Sprint" } },
  ])
})

test("rejects unsupported commands and task IDs outside the selected workspace", async () => {
  const dependencies = {
    updateTask: async () => assert.fail("must not update"),
    addTask: async () => assert.fail("must not add"),
    renameWorkspace: async () => assert.fail("must not rename"),
  }

  await assert.rejects(() => applyWorkspaceCommand(
    command({ action: "complete_task", taskId: "task-other" }),
    "workspace-1",
    [{ id: "task-redis", title: "Review Redis", status: "todo", bucket: "today" }],
    dependencies,
  ), /not found/i)
  await assert.rejects(() => applyWorkspaceCommand(
    command({ action: "unsupported" }),
    "workspace-1",
    [],
    dependencies,
  ), /can't make that change yet/i)
})

function command(overrides: Partial<WorkspaceCommand>): WorkspaceCommand {
  return {
    action: "unsupported",
    taskId: null,
    taskTitle: null,
    newTitle: null,
    bucket: null,
    dueDate: null,
    ...overrides,
  }
}
