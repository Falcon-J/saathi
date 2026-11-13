import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { createWorkspaceInCanvas } from "./service.ts"

test("contextual creation validates the exact command before querying the database", async () => {
  const input = { commandId: randomUUID(), workspaceId: randomUUID(), resourceId: randomUUID(), parentId: randomUUID(), expectedParentVersion: 1, name: "Launch" }
  for (const invalid of [{ ...input, name: " " }, { ...input, expectedParentVersion: 0 }, { ...input, mode: "restricted" }, { ...input, tasks: [] }, { ...input, timezone: "Not/AZone" }]) {
    await assert.rejects(createWorkspaceInCanvas(randomUUID(), invalid as never), { code: "validation" })
  }
})
