import test from "node:test"
import assert from "node:assert/strict"
import { permitsCapability } from "./capability-ceiling.ts"

test("omitted ceilings preserve existing authorization while explicit ceilings fail closed", () => {
  assert.equal(permitsCapability(undefined, "edit"), true)
  assert.equal(permitsCapability({}, "edit"), false)
  assert.equal(permitsCapability({ edit: true }, "edit"), false)
  assert.equal(permitsCapability({ read: true }, "edit"), false)
  assert.equal(permitsCapability({ read: true, edit: true }, "edit"), true)
  assert.equal(permitsCapability({ read: true, edit: true }, "delete"), false)
})
