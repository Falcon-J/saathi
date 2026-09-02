const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8")

test("dashboard keeps realtime recovery next to the board", () => {
  assert.match(source, /role="status"/)
  assert.match(source, /Updates are paused\. Reconnect to continue\./)
  assert.match(source, /onClick={realtime\.connect}/)
  assert.doesNotMatch(source, /One persistent stream for this workspace\./)
})
