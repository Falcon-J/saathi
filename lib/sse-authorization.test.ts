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

test("distinct actors share a fresh workspace query without sharing authorization decisions", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  let reads = 0
  const allowed = new Set(["owner"])
  const check = createBatchedMembershipVerifier(async (_workspace, actors) => {
    reads++
    return actors.filter(actor => allowed.has(actor))
  })
  assert.deepEqual(await Promise.all([check("one", "owner"), check("one", "outsider"), check("one", "owner")]), [true, false, true])
  assert.equal(reads, 1)
  allowed.clear()
  assert.equal(await check("one", "owner"), false)
  assert.equal(reads, 2)
})

test("batched reads isolate workspaces and retry after database failure", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  let failed = false
  const check = createBatchedMembershipVerifier(async (workspace, actors) => {
    if (!failed) { failed = true; throw new Error("Database unavailable") }
    return workspace === "one" ? actors : []
  })
  await assert.rejects(check("one", "owner"), /Database unavailable/)
  assert.deepEqual(await Promise.all([check("one", "owner"), check("two", "owner")]), [true, false])
})

test("an actor arriving after query dispatch gets a separate fresh query", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  let release!: () => void
  let dispatched!: () => void
  const started = new Promise<void>(resolve => { dispatched = resolve })
  let reads = 0
  const check = createBatchedMembershipVerifier(async (_workspace, actors) => {
    reads++
    if (reads === 1) {
      dispatched()
      await new Promise<void>(resolve => { release = resolve })
    }
    return actors.filter(actor => actor === "owner")
  })
  const owner = check("one", "owner")
  await started
  const outsider = check("one", "outsider")
  release()
  assert.equal(await outsider, false)
  assert.equal(reads, 2)
  assert.equal(await owner, true)
})

test("checks arriving during a workspace read accumulate into the next fresh query", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  let release!: () => void, dispatched!: () => void
  const started = new Promise<void>(resolve => { dispatched = resolve })
  const batches: string[][] = []
  const check = createBatchedMembershipVerifier(async (_workspace, actors) => {
    batches.push(actors)
    if (batches.length === 1) { dispatched(); await new Promise<void>(resolve => { release = resolve }) }
    return actors
  })
  const first = check("one", "first")
  await started
  const second = check("one", "second")
  await new Promise(resolve => setTimeout(resolve, 25))
  const third = check("one", "third")
  assert.equal(batches.length, 1)
  release()
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true])
  assert.deepEqual(batches, [["first"], ["second", "third"]])
})
