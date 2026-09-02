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
