const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8")

test("landing page keeps the focused Saathi entry hierarchy", () => {
  assert.match(source, /Move work forward\./)
  assert.match(source, /A focused workspace for teams that build together\./)
  assert.match(source, /Create a workspace/)
  assert.match(source, /href="\/login"/)
  assert.match(source, /href="\/register"/)
  assert.match(source, /To do/)
  assert.match(source, /In progress/)
  assert.match(source, /Done/)
  assert.doesNotMatch(source, /saathi-hero-texture/)
  assert.doesNotMatch(source, /Command center|Live engine|SSE task updates/)
})
