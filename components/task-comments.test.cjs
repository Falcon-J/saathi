const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const source = fs.readFileSync("components/task-comments.tsx", "utf8")

test("task comments render existing discussion and use the server actions", () => {
  assert.match(source, /getTaskComments/)
  assert.match(source, /addTaskComment/)
  assert.match(source, /Add comment/)
  assert.match(source, /aria-label=\"Task comments\"/)
})

test("task comments provide explicit loading and failure states", () => {
  assert.match(source, /Loading comments/)
  assert.match(source, /role=\"alert\"/)
  assert.match(source, /Unable to load comments/)
})
