import assert from "node:assert/strict"
import test from "node:test"
import { hashPassword, verifyPassword } from "./passwords.ts"

test("hashes passwords and verifies the correct password", async () => {
  const hash = await hashPassword("correct horse battery staple")

  assert.notEqual(hash, "correct horse battery staple")
  assert.equal((await verifyPassword("correct horse battery staple", hash)).valid, true)
  assert.equal((await verifyPassword("wrong password", hash)).valid, false)
})

test("marks legacy plaintext records for upgrade after a valid login", async () => {
  assert.deepEqual(await verifyPassword("legacy-password", "legacy-password"), {
    valid: true,
    needsRehash: true,
  })
})
