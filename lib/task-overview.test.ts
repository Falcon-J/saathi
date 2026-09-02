import assert from "node:assert/strict"
import test from "node:test"
import { groupTasksForOverview } from "./task-overview.ts"

const baseTask = {
  title: "Task",
  completed: false,
  status: "todo" as const,
}

test("groups completed tasks separately from execution buckets", () => {
  const groups = groupTasksForOverview([
    { ...baseTask, id: "done", completed: true, status: "done", bucket: "today" },
    { ...baseTask, id: "today", bucket: "today" },
    { ...baseTask, id: "next", bucket: "next" },
  ], "2026-09-02")

  assert.deepEqual(groups.completed.map((task) => task.id), ["done"])
  assert.deepEqual(groups.today.map((task) => task.id), ["today"])
  assert.deepEqual(groups.next.map((task) => task.id), ["next"])
  assert.equal(groups.completion, 33)
})

test("uses due dates for legacy tasks without an explicit bucket", () => {
  const groups = groupTasksForOverview([
    { ...baseTask, id: "overdue", dueDate: "2026-09-01" },
    { ...baseTask, id: "undated" },
    { ...baseTask, id: "future", dueDate: "2026-09-03" },
  ], "2026-09-02")

  assert.deepEqual(groups.today.map((task) => task.id), ["overdue", "undated"])
  assert.deepEqual(groups.next.map((task) => task.id), ["future"])
})
