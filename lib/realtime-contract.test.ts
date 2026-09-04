import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import {
  normalizeRealtimeEvent,
  parseRealtimeStreamEntry,
  type RealtimeEvent,
} from "./realtime.ts"
import { streamService } from "./redis-streams.ts"

test("normalizes a valid realtime event envelope", () => {
  const event = normalizeRealtimeEvent({
    type: "task-updated",
    workspaceId: "workspace-1",
    userId: "user-1",
    timestamp: 1788516000000,
    data: { task: { id: "task-1" } },
  })

  assert.deepEqual(event, {
    type: "task-updated",
    workspaceId: "workspace-1",
    userId: "user-1",
    timestamp: 1788516000000,
    data: { task: { id: "task-1" } },
  })
})

test("rejects an event with an unknown type", () => {
  assert.throws(
    () => normalizeRealtimeEvent({
      type: "task-unknown",
      workspaceId: "workspace-1",
      userId: "user-1",
      timestamp: Date.now(),
      data: {},
    }),
    /Realtime event is invalid/,
  )
})

test("rejects an event whose payload is not an object", () => {
  assert.throws(
    () => normalizeRealtimeEvent({
      type: "task-created",
      workspaceId: "workspace-1",
      userId: "user-1",
      timestamp: Date.now(),
      data: "not-an-object",
    }),
    /Realtime event is invalid/,
  )
})

test("parses a stream entry with its stable stream identity", () => {
  const event = parseRealtimeStreamEntry({
    id: "1788516000000-2",
    fields: {
      type: "task-created",
      workspaceId: "workspace-1",
      userId: "user-1",
      timestamp: "1788516000000",
      data: JSON.stringify({ task: { id: "task-1" } }),
      _publishedAt: "1788516000001",
    },
  })

  assert.deepEqual(event, {
    id: "1788516000000-2",
    type: "task-created",
    workspaceId: "workspace-1",
    userId: "user-1",
    timestamp: 1788516000000,
    data: { task: { id: "task-1" } },
    publishedAt: 1788516000001,
  })
})

test("drops malformed stream entries instead of trusting their payload", () => {
  const event = parseRealtimeStreamEntry({
    id: "1788516000000-3",
    fields: {
      type: "task-created",
      workspaceId: "workspace-1",
      userId: "user-1",
      timestamp: "not-a-timestamp",
      data: "{}",
    },
  })

  assert.equal(event, null)
})

test("keeps workspace streams bounded for replay safety", async () => {
  const streamKey = `test:realtime-retention:${randomUUID()}`
  for (let index = 0; index < 1005; index += 1) {
    await streamService.xadd(streamKey, { type: "task-created", index })
  }

  const retained = await streamService.xrange(streamKey, "-", "+")
  assert.equal(retained.length, 1000)
})

const _typeCheck: RealtimeEvent = {
  type: "task-created",
  workspaceId: "workspace-1",
  userId: "user-1",
  timestamp: Date.now(),
  data: {},
}

void _typeCheck
