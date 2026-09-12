const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const overview = fs.readFileSync("components/workspace-overview.tsx", "utf8")
const dashboard = fs.readFileSync("app/dashboard/page.tsx", "utf8")

test("workspace overview mounts the advisor with the full task creation path", () => {
  assert.match(overview, /import \{ WorkspaceAdvisor \}/)
  assert.match(overview, /<WorkspaceAdvisor workspaceId=\{workspace\.id\}/)
  assert.match(overview, /onAddTask=\{onAddTask\}/)
  assert.match(overview, /aiEnabled && <WorkspaceAdvisor/)
  assert.match(dashboard, /<WorkspaceOverview[\s\S]*onAddTask=\{handleAddTask\}/)
})
