const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "dashboard-navigation.tsx"), "utf8")

test("workspace navigation names only currently supported destinations", () => {
  assert.match(source, /label: "Home"/)
  assert.match(source, /label: "My Tasks"/)
  assert.match(source, /label: "People"/)
  assert.doesNotMatch(source, /\{compact && <span>/)
  assert.doesNotMatch(source, /label: "Projects"|label: "Calendar"|label: "AI Assistant"/)
})
