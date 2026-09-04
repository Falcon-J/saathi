import assert from "node:assert/strict"
import test from "node:test"
import {
  authorizeWorkspaceSubscription,
  createSingleFlightPoll,
  getInitialStreamCursor,
  getReplayStatus,
  shouldProcessEvent,
} from "./realtime-sse.ts"

test("uses the latest Redis stream ID for a new SSE connection", () => {
  assert.equal(getInitialStreamCursor(null, "1788342660000-3"), "1788342660000-3")
})

test("preserves the browser cursor when reconnecting", () => {
  assert.equal(getInitialStreamCursor("1788342660100-1", "1788342660000-3"), "1788342660100-1")
})

test("starts from the beginning when the workspace stream is empty", () => {
  assert.equal(getInitialStreamCursor(null, null), "0-0")
})

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

test("requires a resync when the reconnect cursor fell out of retention", () => {
  assert.equal(getReplayStatus("1788342660000-3", "1788342660100-0", "1788342660200-0"), "resync-required")
})

test("replays from a cursor that is still retained", () => {
  assert.equal(getReplayStatus("1788342660100-0", "1788342660100-0", "1788342660200-0"), "replayable")
})

test("treats an empty stream as replayable from the beginning", () => {
  assert.equal(getReplayStatus("0-0", null, null), "empty")
})

test("requires a resync when a reconnect cursor is newer than the stream", () => {
  assert.equal(getReplayStatus("1788342660300-0", "1788342660100-0", "1788342660200-0"), "resync-required")
})

test("ignores a duplicate SSE event ID", () => {
  const seen = new Set<string>()

  assert.equal(shouldProcessEvent(seen, "1788342660100-1"), true)
  assert.equal(shouldProcessEvent(seen, "1788342660100-1"), false)
  assert.equal(shouldProcessEvent(seen, "1788342660100-2"), true)
})
