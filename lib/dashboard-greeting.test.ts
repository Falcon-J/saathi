import assert from "node:assert/strict"
import test from "node:test"
import { getDashboardGreetingForHour } from "./dashboard-greeting.ts"

test("uses the user's local hour for the dashboard greeting", () => {
  assert.equal(getDashboardGreetingForHour(0), "Good morning")
  assert.equal(getDashboardGreetingForHour(11), "Good morning")
  assert.equal(getDashboardGreetingForHour(12), "Good afternoon")
  assert.equal(getDashboardGreetingForHour(17), "Good afternoon")
  assert.equal(getDashboardGreetingForHour(18), "Good evening")
  assert.equal(getDashboardGreetingForHour(23), "Good evening")
})
