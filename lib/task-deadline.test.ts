import test from "node:test"
import assert from "node:assert/strict"
import { taskDeadline } from "./task-deadline.ts"

test("date-only deadlines remain calendar dates rather than midnight instants", () => {
  assert.deepEqual(taskDeadline({ dueDate: "2026-09-10" }), { date: "2026-09-10", instant: null })
})
test("explicit time is authoritative and clearing removes both representations", () => {
  assert.deepEqual(taskDeadline({ dueDate: "2026-09-10", dueAt: "2026-09-10T18:00:00+05:30" }), { date: null, instant: "2026-09-10T12:30:00.000Z" })
  assert.deepEqual(taskDeadline({}), { date: null, instant: null })
})
test("impossible dates and timezone-less instants are rejected", () => {
  assert.throws(() => taskDeadline({ dueDate: "2026-02-30" }))
  assert.throws(() => taskDeadline({ dueAt: "2026-09-10T12:00:00" }))
})
