const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const source = fs.readFileSync("components/workspace-advisor.tsx", "utf8")

test("advisor panel keeps AI contextual and reviewable", () => {
  assert.match(source, /"use client"/)
  assert.match(source, /askWorkspaceAdvisor/)
  assert.match(source, /Summarize workspace/)
  assert.match(source, /Find attention items/)
  assert.match(source, /Draft a task/)
  assert.match(source, /Review task draft/)
  assert.match(source, /Create task/)
  assert.match(source, /onAddTask/)
  assert.match(source, /retryAfterSeconds/)
  assert.match(source, /aria-busy/)
  assert.doesNotMatch(source, /autoCreate|autonomous|saveWithoutReview/i)
})
