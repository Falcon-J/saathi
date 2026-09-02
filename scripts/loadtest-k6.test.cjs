const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "loadtest.k6.js"), "utf8")

test("k6 scenario has a named default export", () => {
  assert.match(source, /export default function runLoadScenario\(\)/)
})
