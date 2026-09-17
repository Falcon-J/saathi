import assert from "node:assert/strict"
import test from "node:test"
import { groupTasksForOverview } from "./task-overview.ts"
import { calendarDateKey, calendarDateAt, formatTaskDue, todayCalendarDate } from "./task-time.ts"

const baseTask = {
  title: "Task",
  completed: false,
  status: "todo" as const,
}

test("keeps valid date-only deadlines as calendar dates", () => {
  assert.equal(calendarDateKey("2026-09-03"), "2026-09-03")
  assert.equal(calendarDateKey("2026-02-30"), null)
})

test("derives Today from the workspace timezone", () => {
  const now = new Date("2026-09-15T23:30:00.000Z")
  assert.equal(todayCalendarDate("Asia/Kolkata", now), "2026-09-16")
  assert.equal(todayCalendarDate("America/Los_Angeles", now), "2026-09-15")
})

test("keeps stored workspace target dates on their UTC calendar day", () => {
  const target = "2026-09-16T00:00:00.000Z"
  assert.equal(calendarDateAt(target, "UTC"), "2026-09-16")
})

test("formats precise deadlines in the workspace timezone while preserving date-only deadlines", () => {
  const kolkata = formatTaskDue("2026-09-16T23:30:00.000Z", undefined, "Asia/Kolkata") ?? ""
  const losAngeles = formatTaskDue("2026-09-16T23:30:00.000Z", undefined, "America/Los_Angeles") ?? ""
  assert.match(kolkata, /17/)
  assert.match(losAngeles, /16/)
  assert.notEqual(kolkata, losAngeles)
  assert.equal(
    formatTaskDue(undefined, "2026-09-16", "America/Los_Angeles"),
    formatTaskDue(undefined, "2026-09-16", "Asia/Kolkata"),
  )
})

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

  assert.deepEqual(groups.overdue.map((task) => task.id), ["overdue"])
  assert.deepEqual(groups.today.map((task) => task.id), ["undated"])
  assert.deepEqual(groups.next.map((task) => task.id), ["future"])
})

test("keeps overdue work separate from tasks due today", () => {
  const groups = groupTasksForOverview([
    { ...baseTask, id: "overdue", dueDate: "2026-09-01" },
    { ...baseTask, id: "today", dueDate: "2026-09-02" },
    { ...baseTask, id: "future", dueDate: "2026-09-03" },
  ], "2026-09-02")

  assert.deepEqual(groups.overdue.map((task) => task.id), ["overdue"])
  assert.deepEqual(groups.today.map((task) => task.id), ["today"])
  assert.deepEqual(groups.next.map((task) => task.id), ["future"])
})

test("uses an explicit due date over a stale planning bucket", () => {
  const groups = groupTasksForOverview([
    { ...baseTask, id: "future", bucket: "today", dueDate: "2026-09-03" },
    { ...baseTask, id: "today", bucket: "next", dueDate: "2026-09-02" },
  ], "2026-09-02")

  assert.deepEqual(groups.today.map((task) => task.id), ["today"])
  assert.deepEqual(groups.next.map((task) => task.id), ["future"])
})
