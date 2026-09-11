const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const source = fs.readFileSync("app/actions/comments.ts", "utf8")

test("comment actions derive identity from the server session", () => {
  assert.match(source, /getSession\(\)/)
  assert.match(source, /createTaskComment\(session\.id, taskId, body\)/)
  assert.doesNotMatch(source, /userId.*body|actorId.*body/)
})

test("comment creation is rate limited and revalidates the dashboard", () => {
  assert.match(source, /consumeDistributedRateLimit\(/)
  assert.match(source, /revalidatePath\("\/dashboard"\)/)
  assert.match(source, /return \{ success: true, comment \}/)
  assert.match(source, /return \{ error:/)
})
