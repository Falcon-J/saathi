const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "auth-form.tsx"), "utf8")

test("signup copy describes account creation before workspace setup", () => {
  assert.match(source, /Create your workspace/)
  assert.match(source, /Create an account/)
  assert.match(source, /Turn your ideas into progress with your team/)
})

test("authentication forms render recoverable errors inline", () => {
  assert.match(source, /const \[formError, setFormError\] = useState<string \| null>\(null\)/)
  assert.match(source, /role="alert"/)
  assert.match(source, /WELCOME BACK/)
  assert.match(source, /Create an account/)
  assert.doesNotMatch(source, /saathi-grid/)
  assert.doesNotMatch(source, /Workspace gateway|SSE task updates/)
})

test("authentication suite follows the approved reference layout", () => {
  assert.match(source, /lg:grid-cols-\[minmax\(0,0\.86fr\)_minmax\(430px,1fr\)\]/)
  assert.match(source, /2xl:grid-cols-\[minmax\(280px,0\.76fr\)_minmax\(500px,0\.94fr\)_minmax\(330px,0\.82fr\)\]/)
  assert.match(source, /Clarity today\. Progress tomorrow\./)
  assert.match(source, /Forgot password\?/)
  assert.match(source, /provider === "Google" \? "Continue with Google" : "Continue with GitHub"/)
  assert.match(source, /Keep me signed in/)
  assert.match(source, /Show password/)
  assert.match(source, /Back/)
})
