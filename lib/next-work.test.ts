import assert from "node:assert/strict"
import test from "node:test"
import { deriveNextWork, type NextWorkTask, type TaskDependency } from "./next-work.ts"

const now = new Date("2026-10-27T12:00:00.000Z")
const task = (id: string, fields: Partial<NextWorkTask> = {}): NextWorkTask => ({
  id, workspaceId: "workspace", title: `Task ${id}`, completed: false, status: "todo", ...fields,
})
const edge = (dependentTaskId: string, prerequisiteTaskId: string): TaskDependency => ({
  workspaceId: "workspace", dependentTaskId, prerequisiteTaskId,
})
const ids = (items: ReturnType<typeof deriveNextWork>["ready"]) => items.map(item => item.task.id)

test("identifies the next task in a chain from complete task facts", () => {
  const tasks = [task("A", { completed: true, status: "done" }), task("B", { completed: true, status: "done" }), task("C"), task("D"), task("E")]
  const dependencies = [edge("B", "A"), edge("C", "B"), edge("D", "C"), edge("E", "D")]
  const result = deriveNextWork(tasks, dependencies, "UTC", now)
  assert.equal(result.asOf, now.toISOString())
  assert.deepEqual(ids(result.ready), ["C"])
  assert.deepEqual(ids(result.waiting), ["D", "E"])
  assert.deepEqual(result.ready[0].prerequisites, [{ taskId: "B", title: "Task B", status: "done" }])
  assert.equal(result.ready[0].readiness, "ready")
  assert.equal(result.ready[0].unassigned, true)
  assert.deepEqual(result.completedInconsistencies, [])

  const reopened = deriveNextWork(tasks.map(item => item.id === "B" ? { ...item, status: "todo" as const, completed: false } : item), dependencies, "UTC", now)
  assert.deepEqual(ids(reopened.ready), ["B"])
  assert.deepEqual(ids(reopened.waiting), ["C", "D", "E"])
  assert.equal(tasks[1].status, "done", "projection must not mutate authoritative tasks")
})

test("requires every prerequisite in a diamond and keeps unassigned separate", () => {
  const tasks = [task("A", { completed: true, status: "done" }), task("B"), task("C", { completed: true, status: "done" }), task("D", { assigneeEmail: "member@example.test" })]
  const dependencies = [edge("B", "A"), edge("C", "A"), edge("D", "C"), edge("D", "B")]
  const result = deriveNextWork(tasks, dependencies, "UTC", now)
  assert.deepEqual(ids(result.ready), ["B"])
  assert.deepEqual(result.waiting[0].prerequisites, [
    { taskId: "B", title: "Task B", status: "todo" },
    { taskId: "C", title: "Task C", status: "done" },
  ])
  assert.equal(result.waiting[0].unassigned, false)
  const allDone = deriveNextWork(tasks.map(item => item.id === "B" ? { ...item, completed: true, status: "done" as const } : item), dependencies, "UTC", now)
  assert.deepEqual(ids(allDone.ready), ["D"])
})

test("roots are ready and completed tasks with unfinished prerequisites are separate", () => {
  const tasks = [task("root"), task("done", { completed: true, status: "done" })]
  const result = deriveNextWork(tasks, [edge("done", "root")], "UTC", now)
  assert.deepEqual(ids(result.ready), ["root"])
  assert.deepEqual(result.ready[0].prerequisites, [])
  assert.deepEqual(ids(result.waiting), [])
  assert.deepEqual(ids(result.completedInconsistencies), ["done"])
  assert.equal(result.completedInconsistencies[0].readiness, "completed_inconsistent")
  assert.equal(tasks[1].status, "done")
  assert.deepEqual(deriveNextWork([], [], "UTC", now), { asOf: now.toISOString(), ready: [], waiting: [], completedInconsistencies: [] })
})

test("rejects incomplete, duplicate, cross-workspace and cyclic graphs", () => {
  const tasks = [task("A"), task("B"), task("C")]
  for (const dependencies of [
    [edge("B", "missing")],
    [edge("missing", "A")],
    [edge("B", "A"), edge("B", "A")],
    [edge("A", "A")],
    [edge("A", "B"), edge("B", "A")],
    [edge("A", "B"), edge("B", "C"), edge("C", "A")],
    [{ ...edge("B", "A"), workspaceId: "other" }],
  ]) assert.throws(() => deriveNextWork(tasks, dependencies, "UTC", now), /graph/i)
  assert.throws(() => deriveNextWork([task("A"), task("A")], [], "UTC", now), /graph/i)
  assert.throws(() => deriveNextWork([task("A"), task("B", { workspaceId: "other" })], [], "UTC", now), /graph/i)
})

test("orders mixed deadlines by workspace date, timed instants before date-only, and stable IDs", () => {
  const tasks = [
    task("undated-z"), task("date-b", { dueDate: "2026-10-27" }),
    task("timed-late", { dueAt: "2026-10-27T17:30:00Z" }),
    task("timed-early-z", { dueAt: "2026-10-27T01:00:00Z" }),
    task("date-a", { dueDate: "2026-10-27" }),
    task("timed-early-a", { dueAt: "2026-10-27T01:00:00Z" }), task("undated-a"),
  ]
  const expected = ["timed-early-a", "timed-early-z", "timed-late", "date-a", "date-b", "undated-a", "undated-z"]
  assert.deepEqual(ids(deriveNextWork(tasks, [], "UTC", now).ready), expected)
  assert.deepEqual(ids(deriveNextWork([...tasks].reverse(), [], "UTC", now).ready), expected)
  assert.deepEqual(ids(deriveNextWork([
    task("timed", { dueAt: "2026-10-27T23:00:00Z" }), task("date", { dueDate: "2026-10-27" }),
  ], [], "Asia/Kolkata", now).ready), ["date", "timed"])
})

test("keeps precise deadlines chronological through repeated DST local hours", () => {
  const result = deriveNextWork([
    task("later", { dueAt: "2026-11-01T06:15:00Z" }),
    task("date", { dueDate: "2026-11-01" }),
    task("earlier", { dueAt: "2026-11-01T05:45:00Z" }),
  ], [], "America/New_York", now)
  assert.deepEqual(ids(result.ready), ["earlier", "later", "date"])
})

test("invalid deadline data or timezone cannot silently become an undated ready result", () => {
  assert.throws(() => deriveNextWork([task("A", { dueDate: "2026-02-30" })], [], "UTC", now), /deadline/i)
  assert.throws(() => deriveNextWork([task("A", { dueAt: "invalid" })], [], "UTC", now), /deadline/i)
  assert.throws(() => deriveNextWork([task("A", { dueAt: "2026-10-27T12:00:00Z", dueDate: "2026-10-27" })], [], "UTC", now), /deadline/i)
  assert.throws(() => deriveNextWork([], [], "Not/A_Timezone", now))
})
