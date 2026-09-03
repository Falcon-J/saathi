const { existsSync, readFileSync } = require("node:fs")
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

test("dashboard navigation and logout expose explicit loading and failure states", () => {
  assert.match(source, /onOpenBoard/)
  assert.match(source, /const result = await logout\(\)/)
  assert.match(source, /logoutError/)
  assert.match(source, /aria-busy/)
  assert.match(source, /try \{[\s\S]*const result = await logout\(\)[\s\S]*catch \(caughtError\)/)
})

test("app and dashboard routes provide intentional loading UI", () => {
  assert.equal(existsSync(path.join(__dirname, "..", "loading.tsx")), true)
  assert.equal(existsSync(path.join(__dirname, "loading.tsx")), true)
})
