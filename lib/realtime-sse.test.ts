import assert from "node:assert/strict"
import test from "node:test"
import {
  authorizeWorkspaceSubscription,
  createSingleFlightPoll,
} from "./realtime-sse.ts"

test("rejects an authenticated user who is not a workspace member", () => {
  const result = authorizeWorkspaceSubscription(
    { members: [{ email: "member@example.com" }] },
    "outsider@example.com",
  )

  assert.deepEqual(result, {
    allowed: false,
    status: 403,
    message: "Forbidden",
  })
})

test("allows an authenticated workspace member", () => {
  const result = authorizeWorkspaceSubscription(
    { members: [{ email: "member@example.com" }] },
    "member@example.com",
  )

  assert.deepEqual(result, { allowed: true })
})

test("matches workspace membership without treating email casing as a different identity", () => {
  const result = authorizeWorkspaceSubscription(
    { members: [{ email: "Member@Example.com" }] },
    " member@example.com ",
  )

  assert.deepEqual(result, { allowed: true })
})

test("prevents overlapping event polls", async () => {
  let calls = 0
  const releases: Array<() => void> = []

  const poll = createSingleFlightPoll(async () => {
    calls += 1
    await new Promise<void>((resolve) => {
      releases.push(resolve)
    })
  })

  const first = poll()
  const second = await poll()

  assert.equal(second, false)
  assert.equal(calls, 1)

  releases.shift()?.()
  assert.equal(await first, true)

  const third = poll()
  releases.shift()?.()
  assert.equal(await third, true)
  assert.equal(calls, 2)
})
