import assert from "node:assert/strict"
import test from "node:test"
import { connectionWorkspaceNames } from "./workspace-scope.ts"
test("connection scope shows authorized names and conceals unavailable workspace identity", () => {
  assert.deepEqual(connectionWorkspaceNames(["a", "revoked"], [{ id: "a", name: "Delivery" }]), ["Delivery", "Unavailable workspace"])
})
