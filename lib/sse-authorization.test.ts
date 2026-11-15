import test from "node:test"
import assert from "node:assert/strict"
import { createMembershipVerifier } from "./sse-authorization.ts"

test('section policies are batched once per actor while unattached workspace membership stays on its fast path', async () => {
  const { createBatchedMembershipVerifier } = await import('./sse-authorization.ts')
  const policyReads: unknown[] = []
  let revoked = false
  const check = createBatchedMembershipVerifier(async pairs => pairs.map(pair => ({ ...pair, sectionAttached: pair.workspaceId !== 'legacy' })), async (actorId, rows) => {
    policyReads.push({ actorId, rows })
    return revoked ? [] : rows.filter(row => row.id === 'readable')
  })
  assert.deepEqual(await Promise.all([check('legacy', 'owner'), check('readable', 'owner'), check('restricted', 'owner'), check('readable', 'other')]), [true, true, false, true])
  assert.deepEqual(policyReads, [{ actorId: 'owner', rows: [{ id: 'readable' }, { id: 'restricted' }] }, { actorId: 'other', rows: [{ id: 'readable' }] }])
  revoked = true
  assert.equal(await check('readable', 'owner'), false)
  const before = policyReads.length
  assert.equal(await check('legacy', 'owner'), true)
  assert.equal(policyReads.length, before)
})

test('policy outages fail closed for the whole batch and do not cache completed policy decisions', async () => {
  const { createBatchedMembershipVerifier } = await import('./sse-authorization.ts')
  let failed = true
  const check = createBatchedMembershipVerifier(async pairs => pairs.map(pair => ({ ...pair, sectionAttached: true })), async (_actor, rows) => {
    if (failed) throw new Error('Policy unavailable')
    return rows
  })
  await assert.rejects(() => check('restricted', 'owner'), /Policy unavailable/)
  failed = false
  assert.equal(await check('restricted', 'owner'), true)
})

test("concurrent checks across workspaces dispatch one exact-pair batch", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  const batches: unknown[] = []
  const check = createBatchedMembershipVerifier(async pairs => {
    batches.push(pairs)
    return []
  })
  assert.deepEqual(await Promise.all([
    check("one", "owner"), check("two", "owner"), check("two", "outsider"), check("one", "owner"),
  ]), [false, false, false, false])
  assert.deepEqual(batches, [[
    { workspaceId: "one", actorId: "owner" },
    { workspaceId: "two", actorId: "owner" },
    { workspaceId: "two", actorId: "outsider" },
  ]])
})

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
  const check = createBatchedMembershipVerifier(async pairs => {
    reads++
    return pairs.filter(pair => allowed.has(pair.actorId))
  })
  assert.deepEqual(await Promise.all([check("one", "owner"), check("one", "outsider"), check("one", "owner")]), [true, false, true])
  assert.equal(reads, 1)
  allowed.clear()
  assert.equal(await check("one", "owner"), false)
  assert.equal(reads, 2)
})

test("a failed cross-workspace batch rejects every check and permits retry", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  let failed = false
  const check = createBatchedMembershipVerifier(async pairs => {
    if (!failed) { failed = true; throw new Error("Database unavailable") }
    return pairs.filter(pair => pair.workspaceId === "one")
  })
  const failures = await Promise.allSettled([check("one", "owner"), check("two", "owner")])
  for (const failure of failures) {
    assert.equal(failure.status, "rejected")
    if (failure.status === "rejected") assert.match(failure.reason.message, /Database unavailable/)
  }
  assert.deepEqual(await Promise.all([check("one", "owner"), check("two", "owner")]), [true, false])
})

test("an actor arriving after query dispatch gets a separate fresh query", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  let release!: () => void
  let dispatched!: () => void
  const started = new Promise<void>(resolve => { dispatched = resolve })
  let reads = 0
  const check = createBatchedMembershipVerifier(async pairs => {
    reads++
    if (reads === 1) {
      dispatched()
      await new Promise<void>(resolve => { release = resolve })
    }
    return pairs.filter(pair => pair.actorId === "owner")
  })
  const owner = check("one", "owner")
  await started
  const outsider = check("one", "outsider")
  release()
  assert.equal(await outsider, false)
  assert.equal(reads, 2)
  assert.equal(await owner, true)
})

test("checks across workspaces arriving during a read accumulate into the next fresh query", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  let release!: () => void, dispatched!: () => void
  const started = new Promise<void>(resolve => { dispatched = resolve })
  const batches: string[][] = []
  const check = createBatchedMembershipVerifier(async pairs => {
    batches.push(pairs.map(pair => `${pair.workspaceId}:${pair.actorId}`))
    if (batches.length === 1) { dispatched(); await new Promise<void>(resolve => { release = resolve }) }
    return pairs
  })
  const first = check("one", "first")
  await started
  const second = check("one", "second")
  await new Promise(resolve => setTimeout(resolve, 25))
  const third = check("two", "third")
  assert.equal(batches.length, 1)
  release()
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true])
  assert.deepEqual(batches, [["one:first"], ["one:second", "two:third"]])
})

test("partial pair results never authorize the Cartesian product of workspaces and actors", async () => {
  const { createBatchedMembershipVerifier } = await import("./sse-authorization.ts")
  let reads = 0
  const check = createBatchedMembershipVerifier(async () => {
    reads++
    return [{ workspaceId: "one", actorId: "owner" }, { workspaceId: "two", actorId: "outsider" }]
  })
  assert.deepEqual(await Promise.all([
    check("one", "owner"), check("two", "owner"), check("one", "outsider"), check("two", "outsider"),
  ]), [true, false, false, true])
  assert.equal(reads, 1)
})
