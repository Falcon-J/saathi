const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "dashboard-navigation.tsx"), "utf8")

test("workspace navigation exposes the reference destinations honestly", () => {
  assert.match(source, /label: "Home"/)
  assert.match(source, /label: "My Tasks"/)
  assert.match(source, /label: "People"/)
  assert.match(source, /label: "Projects"/)
  assert.match(source, /label: "Calendar"/)
  assert.match(source, /label: "AI Assistant"/)
  assert.match(source, /not available yet/)
})
