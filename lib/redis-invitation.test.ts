import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import redis from "./redis.ts"

test("setIfAbsent only creates an invitation claim once", async () => {
  const key = `test:invitation-claim:${randomUUID()}`

  assert.equal(await redis.setIfAbsent(key, "first", { ex: 60 }), true)
  assert.equal(await redis.setIfAbsent(key, "second", { ex: 60 }), false)
  assert.equal(await redis.get(key), "first")

  await redis.del(key)
})
