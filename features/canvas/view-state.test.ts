import assert from "node:assert/strict"
import test from "node:test"
import { readCanvasView, saveCanvasView } from "./view-state.ts"
import { reconcileCanvasNavigation } from "./model.ts"
const scope = { actorId: "actor", canvasId: "personal" }
const focus = { kind: "task" as const, workspaceId: "workspace", taskId: "task" }
function memory() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } }
test("view preferences restore opaque focus with following off and remain bound to account and canvas", () => {
  const storage = memory()
  saveCanvasView(scope, focus, storage)
  const restored = readCanvasView(scope, storage)
  assert.deepEqual(restored.focus, focus)
  assert.equal(restored.followingAgent, false)
  assert.equal(restored.selection, null)
  assert.equal(readCanvasView({ ...scope, actorId: "other" }, storage).focus.kind, "overview")
  const [key, value] = [...storage.values][0]
  storage.values.set(key, value.replace('"actor"', '"other"'))
  assert.equal(readCanvasView(scope, storage).focus.kind, "overview")
})
test("restored presentation never authorizes missing or revoked records", () => {
  const storage = memory(); saveCanvasView(scope, focus, storage)
  assert.equal(reconcileCanvasNavigation(readCanvasView(scope, storage), scope, []).focus.kind, "overview")
  for (const [key] of storage.values) storage.values.set(key, '{"version":1,"scope":{"actorId":"actor","canvasId":"personal"},"focus":{"kind":"task","workspaceId":"workspace"}}')
  assert.equal(readCanvasView(scope, storage).focus.kind, "overview")
})
test("unavailable preference storage keeps manual canvas navigation usable", () => {
  const blocked = { getItem(): string { throw new Error("blocked") }, setItem() { throw new Error("blocked") } }
  assert.doesNotThrow(() => saveCanvasView(scope, focus, blocked))
  assert.equal(readCanvasView(scope, blocked).focus.kind, "overview")
})
