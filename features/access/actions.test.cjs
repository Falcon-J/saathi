const assert = require("node:assert/strict")
const test = require("node:test")
const fs = require("node:fs")
const ts = require("typescript")

function harness({ authenticated = true, failure } = {}) {
  const calls = []
  class AccessPolicyError extends Error { constructor(message, code) { super(message); this.code = code } }
  class RateLimitExceeded extends Error {}
  const dependencies = {
    "../../lib/auth-simple": { getVerifiedActor: async () => authenticated ? { id: "verified-creator" } : null },
    "../../lib/post-commit": { afterDomainCommit: id => calls.push(["delivery", id]) },
    "../../lib/rate-limit": { consumeDistributedRateLimit: async () => {}, RateLimitExceeded },
    "../../lib/env": { getRateLimits: () => ({ tasks: { maxRequests: 10, windowMs: 1000 } }) },
    "./service": {
      AccessPolicyError,
      createWorkspaceInCanvas: async (actor, input) => {
        calls.push(["create", actor, input])
        if (failure === "forbidden") throw new AccessPolicyError("Canvas resource unavailable or access denied", "forbidden")
        if (failure) throw new Error("private connection details")
        return { id: input.resourceId, version: 1, affectedWorkspaceIds: [input.workspaceId], replayed: true }
      },
      filterVisibleAccessMutationResult: async (_, result) => result,
    },
  }
  const exports = {}
  const source = fs.readFileSync("features/access/actions.ts", "utf8")
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function("require", "exports", js)(name => dependencies[name], exports)
  return { ...exports, calls }
}

test("contextual creation actions use the verified actor, exact command and committed delivery scope", async () => {
  const actions = harness(), input = { commandId: "same-command", parentId: "section", workspaceId: "created-workspace", resourceId: "placement", expectedParentVersion: 3, name: "Launch" }
  const result = await actions.runCanvasAccessCommand({ operation: "workspace.create", input })
  assert.equal(result.success, true)
  assert.equal(result.result.replayed, true)
  assert.deepEqual(actions.calls, [["create", "verified-creator", input], ["delivery", "created-workspace"]])
})

test("contextual actions reject missing identity and preserve definitive versus uncertain failures", async () => {
  const command = { operation: "workspace.create", input: {} }
  const unauthenticated = harness({ authenticated: false })
  assert.equal((await unauthenticated.runCanvasAccessCommand(command)).code, "unauthenticated")
  assert.deepEqual(unauthenticated.calls, [])
  const forbidden = await harness({ failure: "forbidden" }).runCanvasAccessCommand(command)
  assert.equal(forbidden.code, "forbidden")
  assert.equal(forbidden.unknownOutcome, undefined)
  const uncertain = await harness({ failure: "transport" }).runCanvasAccessCommand(command)
  assert.equal(uncertain.unknownOutcome, true)
  assert.doesNotMatch(uncertain.error, /private connection/)
})
