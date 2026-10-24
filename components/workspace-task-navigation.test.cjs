const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const overview = fs.readFileSync("components/workspace-overview.tsx", "utf8")
const settings = fs.readFileSync("components/workspace-settings.tsx", "utf8")
const taskList = fs.readFileSync("components/task-list.tsx", "utf8")
const dashboard = fs.readFileSync("app/dashboard/page.tsx", "utf8")

test("overview task titles open the existing board editor", () => {
  assert.match(overview, /onOpenTask/)
  assert.match(overview, /Open \$\{task\.title\} task/)
  assert.match(taskList, /openTaskId/)
  assert.match(dashboard, /openTaskId=\{taskToOpen\}/)
  assert.match(dashboard, /onOpenTask=\{handleOpenTask\}/)
})

test("workspace target dates use their stored UTC calendar value", () => {
  assert.match(overview, /formatCalendarDate\(workspace\.targetAt, "UTC"\)/)
  assert.match(settings, /calendarDateAt\(workspace\.targetAt \?\? undefined, "UTC"\)/)
})

test("member task details stay readable while editing remains permission gated", () => {
  assert.doesNotMatch(taskList, /disabled=\{!taskPermissions\.canEdit\}/)
  assert.match(taskList, /canEdit=\{editorPermissions\.canEdit\}/)
  assert.match(taskList, /<fieldset disabled=\{!canEdit \|\| isSaving\}/)
  assert.match(taskList, /\{canEdit && <Button type="submit"/)
  assert.match(taskList, /!editorPermissions\.canEdit/)
  assert.match(taskList, /<TaskComments taskId=\{task\.id\}/)
})
