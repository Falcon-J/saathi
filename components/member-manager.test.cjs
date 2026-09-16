const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "member-manager.tsx"), "utf8")

test("member invitations keep validation feedback beside the invite field", () => {
  assert.match(source, /setLastError\("Enter a team member's email address\."\)/)
  assert.match(source, /setLastError\("Enter a valid email address, such as user@example\.com\."\)/)
  assert.doesNotMatch(source, /useNotifications/)
})

test("owners can recover a pending invitation without relying on email delivery", () => {
  assert.match(source, /Copy invite link/)
  assert.match(source, /navigator\.clipboard\.writeText/)
  assert.match(source, /after they sign up or sign in with that email/)
})
