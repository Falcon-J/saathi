import assert from "node:assert/strict"
import test from "node:test"
import { normalizeEmail } from "./identity.ts"

test("normalizes email identity at the boundary", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com")
})
