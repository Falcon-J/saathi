const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const overview = fs.readFileSync("components/workspace-overview.tsx", "utf8")
const taskList = fs.readFileSync("components/task-list.tsx", "utf8")
const dashboard = fs.readFileSync("app/dashboard/page.tsx", "utf8")

test("overview task titles open the existing board editor", () => {
  assert.match(overview, /onOpenTask/)
  assert.match(overview, /Open \$\{task\.title\} task/)
  assert.match(taskList, /openTaskId/)
  assert.match(dashboard, /openTaskId=\{taskToOpen\}/)
  assert.match(dashboard, /onOpenTask=\{handleOpenTask\}/)
})
