const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "dashboard-navigation.tsx"), "utf8")

test("workspace navigation exposes only the v1 destinations", () => {
  assert.match(source, /label: "Overview"/)
  assert.match(source, /label: "Board"/)
  assert.match(source, /label: "Team"/)
  assert.doesNotMatch(source, /Inbox|Workspaces|Projects|Calendar|AI Assistant/)
  assert.doesNotMatch(source, /not available yet/)
})
