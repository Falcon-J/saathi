import assert from "node:assert/strict"
import test from "node:test"
import { accessActorSchema, accessGrantSchema, canvasReferenceSchema } from "./contracts.ts"

test("principal identity cannot smuggle claimed groups or an administrator bypass", () => {
  assert.equal(accessActorSchema.safeParse({ kind: "user", userId: "u", groups: ["administrators"] }).success, false)
  assert.equal(accessActorSchema.safeParse({ kind: "user", userId: "u", admin: true }).success, false)
  assert.equal(accessActorSchema.safeParse({ kind: "agent", agentId: "a", delegationId: "d" }).success, false)
})

test("grants require exact stable identifiers, read and unique known capabilities", () => {
  const grant = { id: "g", resourceId: "r", principal: { kind: "user", id: "u" }, capabilities: ["read", "edit"] }
  assert.equal(accessGrantSchema.safeParse(grant).success, true)
  for (const change of [{ id: " g " }, { capabilities: ["edit"] }, { capabilities: ["read", "read"] }, { capabilities: ["read", "admin"] }]) {
    assert.equal(accessGrantSchema.safeParse({ ...grant, ...change }).success, false)
  }
})

test("human grants reject malformed expiry and revocation instants", () => {
  const grant = { id: "g", resourceId: "r", principal: { kind: "user", id: "u" }, capabilities: ["read"] }
  assert.equal(accessGrantSchema.safeParse({ ...grant, expiresAt: "2026-11-13T00:00:00Z" }).success, true)
  assert.equal(accessGrantSchema.safeParse({ ...grant, expiresAt: "tomorrow" }).success, false)
  assert.equal(accessGrantSchema.safeParse({ ...grant, revokedAt: "" }).success, false)
})

test("a canvas reference cannot carry an embedded permission grant", () => {
  const reference = { id: "r", canvasResourceId: "canvas", targetResourceId: "workspace" }
  assert.equal(canvasReferenceSchema.safeParse(reference).success, true)
  assert.equal(canvasReferenceSchema.safeParse({ ...reference, capabilities: ["read", "edit"] }).success, false)
})
