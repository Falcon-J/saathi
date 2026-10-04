import assert from "node:assert/strict"
import test from "node:test"
import { isAiWorkspaceEnabled } from "./feature-flags.ts"
import * as flags from "./feature-flags.ts"

test("resolves server capability defaults and legacy AI precedence", () => {
  assert.equal(typeof flags.resolveFeatureFlags, "function")
  assert.deepEqual(flags.resolveFeatureFlags({}), { aiWorkspace: false, csvImport: true })
  assert.deepEqual(flags.resolveFeatureFlags({ NEXT_PUBLIC_ENABLE_AI_WORKSPACE: "true" }), { aiWorkspace: true, csvImport: true })
  assert.deepEqual(flags.resolveFeatureFlags({ ENABLE_AI_WORKSPACE: "false", NEXT_PUBLIC_ENABLE_AI_WORKSPACE: "true", ENABLE_CSV_IMPORT: "false" }), { aiWorkspace: false, csvImport: false })
  assert.deepEqual(flags.resolveFeatureFlags({ ENABLE_AI_WORKSPACE: "true", ENABLE_CSV_IMPORT: "true" }), { aiWorkspace: true, csvImport: true })
  assert.deepEqual(flags.resolveFeatureFlags({ ENABLE_AI_WORKSPACE: "TRUE", ENABLE_CSV_IMPORT: "invalid" }), { aiWorkspace: false, csvImport: false })
})

test("keeps AI workspace features disabled unless explicitly enabled", () => {
  assert.equal(isAiWorkspaceEnabled(undefined), false)
  assert.equal(isAiWorkspaceEnabled("false"), false)
  assert.equal(isAiWorkspaceEnabled("TRUE"), false)
  assert.equal(isAiWorkspaceEnabled("true"), true)
})
