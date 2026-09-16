const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const source = fs.readFileSync("hooks/useRealtime.ts", "utf8")

test("useRealtime exposes and dispatches task comment events", () => {
  assert.match(source, /onTaskCommentCreated\?/)
  assert.match(source, /case ['"]task-comment-created['"]:/)
  assert.match(source, /currentOptions\.onTaskCommentCreated\?\.\(event\)/)
})

test("useRealtime exposes a monotonic revision for every accepted event", () => {
  assert.match(source, /const \[eventRevision, setEventRevision\] = useState\(0\)/)
  assert.match(source, /setEventRevision\(value => value \+ 1\)/)
  assert.match(source, /eventRevision,/)
})
