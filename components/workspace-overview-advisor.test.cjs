const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const overview = fs.readFileSync("components/workspace-overview.tsx", "utf8")
const dashboard = fs.readFileSync("app/dashboard/page.tsx", "utf8")

test("workspace overview exposes an optional, reviewable AI advisor", () => {
  assert.match(overview, /WorkspaceAdvisor/)
  assert.match(overview, /isAiWorkspaceEnabled/)
  assert.match(overview, /workspaceId=\{workspace\.id\}/)
  assert.match(overview, /onAddTask=\{onAddTask\}/)
  assert.match(dashboard, /<WorkspaceOverview[\s\S]*onAddTask=\{handleAddTask\}/)
  assert.match(dashboard, /<WorkspaceCreateForm[\s\S]*aiEnabled=\{aiWorkspaceEnabled\}/)
})
