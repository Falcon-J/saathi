const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "route.ts"), "utf8")

test("SSE closes before the Vercel invocation timeout", () => {
  assert.match(source, /const SSE_CONNECTION_MAX_DURATION_MS = 4 \* 60 \* 1000/)
  assert.match(source, /setTimeout\(cleanup, SSE_CONNECTION_MAX_DURATION_MS\)/)
  assert.doesNotMatch(source, /setTimeout\(cleanup, 30 \* 60 \* 1000\)/)
})
