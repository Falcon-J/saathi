const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const workspaceActions = readFileSync(path.join(__dirname, "workspaces.ts"), "utf8")
const workspaceHook = readFileSync(path.join(__dirname, "..", "..", "hooks", "use-workspaces.ts"), "utf8")
const invitationPage = readFileSync(path.join(__dirname, "..", "invitations", "[id]", "page.tsx"), "utf8")

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `${start} not found`)
  assert.notEqual(endIndex, -1, `${end} not found`)
  return source.slice(startIndex, endIndex)
}

test("invitation Server Action returns a serializable mutation result", () => {
  const action = sliceBetween(
    workspaceActions,
    "export async function inviteMemberToWorkspace",
    "export async function removeMemberFromWorkspace",
  )
  assert.match(action, /return \{ success: true/)
  assert.match(action, /return \{ error:/)
})

test("invitation UI consumes the mutation result without duplicate error toast", () => {
  const handler = sliceBetween(
    workspaceHook,
    "const handleAddMember = useCallback",
    "// Add function to refresh workspaces",
  )
  assert.match(handler, /const result = await inviteMemberToWorkspace/)
  assert.match(handler, /getMutationError\(result\)/)
  assert.doesNotMatch(handler, /notifyError\(/)
})

test("an invitation link lets a new recipient create an account before accepting", () => {
  assert.doesNotMatch(invitationPage, /if \(!session\) redirect/)
  assert.match(invitationPage, /Create an account/)
  assert.match(invitationPage, /Sign in/)
  assert.match(invitationPage, /Use the email address that received this invitation/)
})
