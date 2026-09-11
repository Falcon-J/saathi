const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const source = fs.readFileSync("app/actions/workspace-advisor.ts", "utf8")

test("workspace advisor stays inside the authenticated, reviewable boundary", () => {
  assert.match(source, /"use server"/)
  assert.match(source, /getSession/)
  assert.match(source, /readWorkspace/)
  assert.match(source, /listTaskRecords/)
  assert.match(source, /buildAdvisorProjection/)
  assert.match(source, /consumeDistributedRateLimit/)
  assert.match(source, /recordAiOperation/)
  assert.match(source, /isAiWorkspaceEnabled/)
  assert.doesNotMatch(source, /createTaskRecord|autoCreate|applyNaturalLanguageCommand/)
})
