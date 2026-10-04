import test from "node:test"
import assert from "node:assert/strict"
import { createMembershipVerifier } from "./sse-authorization.ts"

test("concurrent subscribers share only an in-flight membership check; revocation triggers a fresh read", async () => {
  let reads = 0, permitted = true, release!: () => void
  const check = createMembershipVerifier(async () => {
    reads++
    if (reads === 1) await new Promise<void>(resolve => { release = resolve })
    return permitted
  })
  const pending = Array.from({ length: 200 }, () => check("workspace", "actor"))
  assert.equal(reads, 1)
  release()
  assert.ok((await Promise.all(pending)).every(Boolean))
  permitted = false
  assert.equal(await check("workspace", "actor"), false)
  assert.equal(reads, 2)
})

test("different actors and workspaces never share authorization, and failures permit retry", async () => {
  const requests: string[] = []
  const check = createMembershipVerifier(async (workspace, actor) => {
    requests.push(`${workspace}:${actor}`)
    if (requests.length === 1) throw new Error("Database unavailable")
    return actor === "owner"
  })
  await assert.rejects(check("one", "owner"), /Database unavailable/)
  assert.deepEqual(await Promise.all([check("one", "owner"), check("two", "owner"), check("one", "outsider")]), [true, true, false])
  assert.equal(requests.length, 4)
})
