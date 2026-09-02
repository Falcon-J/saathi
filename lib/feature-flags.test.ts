import assert from "node:assert/strict"
import test from "node:test"
import { isAiWorkspaceEnabled } from "./feature-flags.ts"

test("keeps AI workspace features disabled unless explicitly enabled", () => {
  assert.equal(isAiWorkspaceEnabled(undefined), false)
  assert.equal(isAiWorkspaceEnabled("false"), false)
  assert.equal(isAiWorkspaceEnabled("TRUE"), false)
  assert.equal(isAiWorkspaceEnabled("true"), true)
})
