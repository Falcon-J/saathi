const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const source = fs.readFileSync("hooks/useRealtime.ts", "utf8")

test("useRealtime exposes and dispatches task comment events", () => {
  assert.match(source, /onTaskCommentCreated\?/)
  assert.match(source, /case ['"]task-comment-created['"]:/)
  assert.match(source, /currentOptions\.onTaskCommentCreated\?\.\(event\)/)
})
