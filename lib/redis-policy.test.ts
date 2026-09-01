import assert from "node:assert/strict"
import test from "node:test"
import { shouldUseMockRedis } from "./redis-policy.ts"

test("uses mock Redis only for development without credentials", () => {
  assert.equal(shouldUseMockRedis("development", false), true)
  assert.equal(shouldUseMockRedis("development", true), false)
  assert.equal(shouldUseMockRedis("staging", false), false)
  assert.equal(shouldUseMockRedis("production", false), false)
})
