import assert from "node:assert/strict"
import test from "node:test"
import { parseCanvasUrl, canvasUrl, resolveCanvasUrl, CANVAS_TOOLS } from "./navigation-url.ts"

test("canvas locations and work views roundtrip without camera state", () => {
  for (const focus of [{ kind: "overview" }, { kind: "resource", resourceId: "section" }, { kind: "workspace", workspaceId: "w" }, { kind: "task", workspaceId: "w", taskId: "t" }] as const) {
    const location = { focus, view: focus.kind === "task" ? "tasks" as const : null, group: null }
    assert.deepEqual(parseCanvasUrl(canvasUrl(location, "/canvas?unrelated=kept#anchor")), location)
    assert.match(canvasUrl(location, "/canvas?unrelated=kept#anchor"), /unrelated=kept/)
  }
  for (const view of CANVAS_TOOLS) {
    const location = { focus: { kind: "workspace" as const, workspaceId: "w" }, view, group: view === "ready" ? "waiting" as const : null }
    assert.deepEqual(parseCanvasUrl(canvasUrl(location)), location)
  }
})
test("untrusted selectors reject duplicates, ambiguous scopes, malformed and bounded inputs", () => {
  for (const search of ["http://[", "?task=t", "?resource=r&workspace=w", "?workspace=w&workspace=x", "?workspace=%00", "?view=unknown", `?workspace=${"a".repeat(129)}`, "?group=ready", "?resource=r&view=tasks"]) assert.equal(parseCanvasUrl(search), null, search)
})
test("restoration waits for current authority and a fresh matching workspace graph", () => {
  const location = parseCanvasUrl("?workspace=w&task=t&view=tasks")!
  const base = { loading: false, error: false, workspaceIds: ["w"], resourceIds: [], currentWorkspaceId: "old", graphWorkspaceId: "old", graphLoading: false, graphError: false, taskIds: ["t"] }
  assert.deepEqual(resolveCanvasUrl(location, { ...base, loading: true }), { kind: "wait" })
  assert.deepEqual(resolveCanvasUrl(location, base), { kind: "select", workspaceId: "w" })
  assert.deepEqual(resolveCanvasUrl(location, { ...base, currentWorkspaceId: "w" }), { kind: "wait" })
  assert.deepEqual(resolveCanvasUrl(location, { ...base, currentWorkspaceId: "w", graphWorkspaceId: "w" }), { kind: "ready" })
  assert.deepEqual(resolveCanvasUrl(location, { ...base, workspaceIds: [] }), { kind: "unavailable" })
  assert.deepEqual(resolveCanvasUrl(location, { ...base, currentWorkspaceId: "w", graphWorkspaceId: "w", taskIds: [] }), { kind: "unavailable" })
})
