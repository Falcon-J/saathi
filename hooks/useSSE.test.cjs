const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "useSSE.ts"), "utf8")

test("SSE effect depends on a stable connect callback", () => {
  assert.match(source, /useCallback/)
  assert.match(source, /const optionsRef = useRef\(options\)/)
  assert.match(source, /optionsRef\.current = options/)
  assert.match(source, /}, \[connect, disconnect\]\)/)
})
