const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "password-recovery-form.tsx"), "utf8")

test("password recovery shares the branded auth layout and preserves inline status", () => {
  assert.doesNotMatch(source, /\.png|radial-gradient/)
  assert.match(source, /<AuthShell eyebrow=/)
  assert.match(source, /Reset your password/)
  assert.match(source, /Set a new password/)
  assert.match(source, /role="status"/)
  assert.match(source, /role="alert"/)
})
