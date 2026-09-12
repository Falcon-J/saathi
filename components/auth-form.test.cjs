const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "auth-form.tsx"), "utf8")

test("signup page keeps account creation copy inside the form", () => {
  assert.match(source, /Create an account/)
  assert.doesNotMatch(source, /Create your workspace|Turn your ideas into progress with your team|GET STARTED/)
})

test("authentication forms render recoverable errors inline", () => {
  assert.match(source, /const \[formError, setFormError\] = useState<string \| null>\(null\)/)
  assert.match(source, /role="alert"/)
  assert.match(source, /Create an account/)
  assert.doesNotMatch(source, /WELCOME BACK|Sign in to your workspace|Clarity today/)
  assert.doesNotMatch(source, /saathi-grid/)
  assert.doesNotMatch(source, /Workspace gateway|SSE task updates/)
})

test("authentication suite follows the approved reference layout", () => {
  assert.match(source, /src="\/saathi-auth-background-v2\.png"/)
  assert.match(source, /fill/)
  assert.match(source, /flex min-w-0 flex-1 items-center/)
  assert.match(source, /sm:items-start/)
  assert.match(source, /w-\[48%\]/)
  assert.match(source, /sm:w-\[clamp\(14rem,34vw,33\.75rem\)\]/)
  assert.match(source, /sm:h-\[100svh\] sm:overflow-hidden/)
  assert.match(source, /Forgot password\?/)
  assert.match(source, /loginWithGoogle\(next\)/)
  assert.match(source, /Continue with Google/)
  assert.doesNotMatch(source, /GitHub|Github/)
  assert.match(source, /Keep me signed in/)
  assert.match(source, /Show password/)
  assert.match(source, /Back/)
})
