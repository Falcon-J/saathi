const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

const source = fs.readFileSync("app/api/internal/outbox/route.ts", "utf8")

test("the authenticated internal worker enforces AI metadata retention", () => {
  assert.match(source, /deleteExpiredAiOperations/)
  assert.match(source, /await deleteExpiredAiOperations\(\)/)
})
