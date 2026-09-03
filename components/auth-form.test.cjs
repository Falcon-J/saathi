const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "auth-form.tsx"), "utf8")

test("signup copy describes account creation before workspace setup", () => {
  assert.match(source, /Create your account/)
  assert.match(source, /then set up a workspace/)
  assert.doesNotMatch(source, /Create your workspace/)
})

test("authentication forms render recoverable errors inline", () => {
  assert.match(source, /const \[formError, setFormError\] = useState<string \| null>\(null\)/)
  assert.match(source, /role="alert"/)
  assert.match(source, /Welcome back/)
  assert.match(source, /Create your account/)
  assert.doesNotMatch(source, /saathi-grid/)
  assert.doesNotMatch(source, /Workspace gateway|SSE task updates/)
})
