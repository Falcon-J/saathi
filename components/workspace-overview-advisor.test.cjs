const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const overview = fs.readFileSync("components/workspace-overview.tsx", "utf8")
const dashboard = fs.readFileSync("app/dashboard/page.tsx", "utf8")

test("workspace overview keeps AI out of the execution surface", () => {
  assert.doesNotMatch(overview, /WorkspaceAdvisor/)
  assert.doesNotMatch(overview, /aiEnabled/)
  assert.match(dashboard, /<WorkspaceOverview[\s\S]*onAddTask=\{handleAddTask\}/)
  assert.match(dashboard, /<WorkspaceCreateForm[\s\S]*aiEnabled=\{aiWorkspaceEnabled\}/)
})
