const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const overview = fs.readFileSync("components/workspace-overview.tsx", "utf8")
const assistant = fs.readFileSync("components/assistant-workspace.tsx", "utf8")
const dashboard = fs.readFileSync("app/dashboard/page.tsx", "utf8")

test("assistant mode owns the optional, reviewable AI advisor", () => {
  assert.match(assistant, /WorkspaceAdvisor/)
  assert.match(assistant, /workspaceId=\{workspace\.id\}/)
  assert.match(assistant, /onConfirmDraft=\{confirmDraft\}/)
  assert.match(assistant, /Assistant unavailable/)
  assert.doesNotMatch(overview, /WorkspaceAdvisor/)
  assert.match(dashboard, /<AssistantWorkspace[\s\S]*aiEnabled=\{aiWorkspaceEnabled\}/)
  assert.match(dashboard, /<WorkspaceCreateForm[\s\S]*aiEnabled=\{aiWorkspaceEnabled\}/)
})
