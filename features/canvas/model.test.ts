import assert from "node:assert/strict"
import test from "node:test"
import type { Workspace } from "../../lib/data/workspaces.ts"
import type { Task } from "../../lib/task-contract.ts"
import {
  projectCanvas, workspaceNodeId, taskNodeId, dependencyEdgeId, cameraStorageKey,
  createCanvasNavigation, navigateCanvas, reconcileCanvasNavigation, parentCanvasFocus,
  type AuthorizedWorkspaceGraph,
  canvasBreadcrumbs,
} from "./model.ts"

const scope = { actorId: "actor", canvasId: "personal" }
const workspace = (id = "w"): Workspace => ({ id, name: id, targetAt: null, timezone: "UTC", version: 1,
  members: [], createdAt: "2026-11-12T00:00:00Z", ownerId: "owner@example.test", ownerUserId: "owner" })
const task = (id: string, workspaceId = "w", done = false): Task => ({ id, workspaceId, title: id,
  completed: done, status: done ? "done" : "todo", priority: "medium", createdBy: "owner@example.test",
  createdAt: "2026-11-12T00:00:00Z", updatedAt: "2026-11-12T00:00:00Z", version: 1 })
const graph = (tasks: Task[] = [], id = "w"): AuthorizedWorkspaceGraph => ({ workspace: workspace(id), complete: true,
  graph: { tasks, dependencies: [], timezone: "UTC", asOf: "2026-11-12T00:00:00Z" } })
const input = (graphs: AuthorizedWorkspaceGraph[]) => ({ graphs, navigation: createCanvasNavigation(scope), zoom: 1 })

for (const count of [50, 100]) test(`dense workspace with ${count} tasks has bounded readiness groups and canonical focus`, () => {
  const entry = graph(Array.from({ length: count }, (_, i) => task(String(i), "w", i >= count - 2)))
  entry.graph.dependencies = [
    { workspaceId: "w", prerequisiteTaskId: "0", dependentTaskId: "1" },
    { workspaceId: "w", prerequisiteTaskId: "0", dependentTaskId: String(count - 1) },
  ]
  const navigation = navigateCanvas(createCanvasNavigation(scope), { kind: "workspace", workspaceId: "w" }, "manual")
  const result = projectCanvas({ graphs: [entry], navigation, zoom: 1 })
  const groups = result.nodes.filter(node => node.kind === "readiness")
  assert.deepEqual(groups.map(node => [node.readiness, node.count]), [["ready", count - 3], ["waiting", 1], ["completed_inconsistent", 1], ["completed", 1]])
  assert.equal(new Set(groups.map(node => node.position.x)).size, 1)
  assert.ok(result.nodes[0].height <= 500)
  assert.ok(result.nodes[0].width <= 450)
  assert.equal(result.records.tasks.size, count)
  assert.equal(result.nodes.filter(node => node.kind === "task" && !node.hidden).length, 0)
  assert.ok(result.edges.every(edge => edge.hidden))
  const focused = projectCanvas({ graphs: [entry], navigation: navigateCanvas(navigation, { kind: "task", workspaceId: "w", taskId: String(count - 1) }, "agent"), zoom: 1 })
  const visibleTasks = focused.nodes.filter(node => node.kind === "task" && !node.hidden)
  assert.equal(visibleTasks.length, 1)
  assert.equal(visibleTasks[0].recordId, String(count - 1))
  assert.equal(visibleTasks[0].representation, "detail")
  assert.ok(visibleTasks[0].position.y + visibleTasks[0].height <= focused.nodes[0].height)
  assert.ok(focused.nodes[0].height <= 500)
  assert.ok(focused.nodes.filter(node => node.kind === "readiness").every(node => node.hidden))
  assert.equal(focused.records.tasks.get(visibleTasks[0].id), entry.graph.tasks[count - 1])
  assert.equal(focused.records.dependencies.size, 2)
  assert.ok(focused.edges.every(edge => edge.hidden))
})

test("dense task selection cannot expose overlapping siblings or retain revoked counts", () => {
  const entry = graph(Array.from({ length: 50 }, (_, index) => task(String(index))))
  const navigation = { ...navigateCanvas(createCanvasNavigation(scope), { kind: "task", workspaceId: "w", taskId: "49" }, "agent"),
    selection: { kind: "task" as const, workspaceId: "w", taskId: "0" } }
  const result = projectCanvas({ graphs: [entry], navigation, zoom: 0.2 })
  assert.deepEqual(result.nodes.filter(node => node.kind === "task" && !node.hidden).map(node => node.recordId), ["49"])
  const revoked = projectCanvas({ graphs: [], navigation, zoom: 1 })
  assert.equal(revoked.nodes.length, 0)
  assert.equal(revoked.records.tasks.size, 0)
  assert.equal(revoked.readiness.size, 0)
})

test("small workspaces retain individual task cards and visible dependency edges", () => {
  const entry = graph(Array.from({ length: 12 }, (_, index) => task(String(index))))
  entry.graph.dependencies = [{ workspaceId: "w", prerequisiteTaskId: "0", dependentTaskId: "1" }]
  const navigation = navigateCanvas(createCanvasNavigation(scope), { kind: "workspace", workspaceId: "w" }, "manual")
  const result = projectCanvas({ graphs: [entry], navigation, zoom: 1 })
  assert.equal(result.nodes.filter(node => node.kind === "readiness").length, 0)
  assert.equal(result.nodes.filter(node => node.kind === "task" && !node.hidden).length, 12)
  assert.equal(result.edges[0].hidden, false)
})

test("company and section focus retain canonical hierarchy and drop revoked resources", () => {
  const resources = [{ id: 'company', parentId: null, workspaceId: null, name: 'Acme' }, { id: 'section', parentId: 'company', workspaceId: null, name: 'Delivery' }, { id: 'attached', parentId: 'section', workspaceId: 'w', name: 'Workspace' }]
  const focused = navigateCanvas(createCanvasNavigation(scope), { kind: 'resource', resourceId: 'section' }, 'manual')
  assert.deepEqual(reconcileCanvasNavigation(focused, scope, [], resources).focus, focused.focus)
  assert.deepEqual(parentCanvasFocus({ kind: 'workspace', workspaceId: 'w' }, resources), focused.focus)
  assert.deepEqual(parentCanvasFocus(focused.focus, resources), { kind: 'resource', resourceId: 'company' })
  assert.deepEqual(canvasBreadcrumbs({ kind: 'task', workspaceId: 'w', taskId: 'a' }, resources, [workspace()], [task('a')]).map(item => item.label), ['Canvas', 'Acme', 'Delivery', 'w', 'a'])
  assert.deepEqual(reconcileCanvasNavigation(focused, scope, [], []).focus, { kind: 'overview' })
})

test("empty authorized sets and empty workspace graphs have distinct projections", () => {
  assert.deepEqual(projectCanvas(input([])).nodes, [])
  const result = projectCanvas(input([graph()]))
  assert.equal(result.nodes.length, 1)
  assert.equal(result.nodes[0].id, workspaceNodeId("w"))
  assert.deepEqual(result.readiness.get("w")?.ready, [])
  assert.deepEqual(result.edges, [])
})

test("stable IDs, edges and automatic group positions are independent of input ordering", () => {
  const a = graph([task("z"), task("a")])
  a.graph.dependencies = [{ workspaceId: "w", prerequisiteTaskId: "a", dependentTaskId: "z" }]
  const b = graph([task("q", "v")], "v")
  const first = projectCanvas(input([a, b]))
  const reversed = projectCanvas(input([b, { ...a, graph: { ...a.graph, tasks: [...a.graph.tasks].reverse() } }]))
  assert.deepEqual(first.nodes, reversed.nodes)
  assert.deepEqual(first.edges, reversed.edges)
  assert.equal(first.edges[0].id, dependencyEdgeId("w", "a", "z"))
  assert.equal(first.edges[0].source, taskNodeId("w", "a"))
  assert.equal(first.edges[0].target, taskNodeId("w", "z"))
  assert.notEqual(taskNodeId("a:b", "c"), taskNodeId("a", "b:c"))
  assert.equal(first.records.tasks.get(taskNodeId("w", "z")), a.graph.tasks[0])
  assert.equal("position" in a.graph.tasks[0], false)
})

test("overview collapses tasks while selection retains detail at every zoom", () => {
  const graphs = [graph([task("a"), task("b")])]
  assert.equal(projectCanvas(input(graphs)).nodes.filter(node => node.kind === "task").every(node => node.hidden), true)
  const navigation = { ...createCanvasNavigation(scope), selection: { kind: "task" as const, workspaceId: "w", taskId: "a" } }
  for (const zoom of [0.1, 0.8, 2]) {
    const result = projectCanvas({ graphs, navigation, zoom })
    const selected = result.nodes.find(node => node.id === taskNodeId("w", "a"))!
    assert.equal(selected.representation, "detail")
    assert.equal(selected.hidden, false)
    assert.equal(result.nodes.find(node => node.id === workspaceNodeId("w"))?.expanded, true)
  }
})

test("workspace focus reveals compact then summary tasks with explicit task focus showing detail", () => {
  const graphs = [graph([task("a")])]
  const navigation = navigateCanvas(createCanvasNavigation(scope), { kind: "workspace", workspaceId: "w" }, "manual")
  assert.equal(projectCanvas({ graphs, navigation, zoom: 0.2 }).nodes[1].representation, "compact")
  assert.equal(projectCanvas({ graphs, navigation, zoom: 1 }).nodes[1].representation, "summary")
  const focused = navigateCanvas(navigation, { kind: "task", workspaceId: "w", taskId: "a" }, "manual")
  assert.equal(projectCanvas({ graphs, navigation: focused, zoom: 0.2 }).nodes[1].representation, "detail")
})

test("readiness uses complete dependencies and changes after completion and reopening", () => {
  const entry = graph([task("a"), task("b")])
  entry.graph.dependencies = [{ workspaceId: "w", prerequisiteTaskId: "a", dependentTaskId: "b" }]
  const initial = projectCanvas(input([entry]))
  assert.equal(initial.nodes.find(node => node.id === taskNodeId("w", "b"))?.readiness, "waiting")
  const done = { ...entry, graph: { ...entry.graph, tasks: [task("a", "w", true), task("b")] } }
  assert.equal(projectCanvas(input([done])).nodes.find(node => node.id === taskNodeId("w", "b"))?.readiness, "ready")
  const bothDone = { ...done, graph: { ...done.graph, tasks: [task("a", "w", true), task("b", "w", true)] } }
  assert.equal(projectCanvas(input([bothDone])).nodes[2].readiness, "completed")
  const reopened = { ...done, graph: { ...done.graph, tasks: [task("a"), task("b", "w", true)] } }
  assert.equal(projectCanvas(input([reopened])).nodes[2].readiness, "completed_inconsistent")
})

test("rejects partial, duplicate, incomplete, cross-workspace and cyclic graph records", () => {
  const entry = graph([task("a"), task("b")])
  assert.throws(() => projectCanvas(input([{ ...entry, complete: false } as unknown as AuthorizedWorkspaceGraph])), /complete/i)
  assert.throws(() => projectCanvas(input([entry, entry])), /duplicate/i)
  assert.throws(() => projectCanvas(input([graph([task("a", "other")])])), /workspace/i)
  for (const dependencies of [
    [{ workspaceId: "other", prerequisiteTaskId: "a", dependentTaskId: "b" }],
    [{ workspaceId: "w", prerequisiteTaskId: "missing", dependentTaskId: "b" }],
    [{ workspaceId: "w", prerequisiteTaskId: "a", dependentTaskId: "b" }, { workspaceId: "w", prerequisiteTaskId: "b", dependentTaskId: "a" }],
  ]) assert.throws(() => projectCanvas(input([{ ...entry, graph: { ...entry.graph, dependencies } }])), /graph|workspace|cycle/i)
})

test("scope changes reset focus, selection and agent following, with distinct personal camera keys", () => {
  const selected = { kind: "task" as const, workspaceId: "w", taskId: "a" }
  const navigation = { ...navigateCanvas(createCanvasNavigation(scope), selected, "agent"), selection: selected }
  for (const nextScope of [{ ...scope, actorId: "someone-else" }, { ...scope, canvasId: "another-canvas" }]) {
    assert.deepEqual(reconcileCanvasNavigation(navigation, nextScope, [graph([task("a")])]), createCanvasNavigation(nextScope))
    assert.notEqual(cameraStorageKey(scope), cameraStorageKey(nextScope))
  }
  assert.notEqual(cameraStorageKey({ actorId: "a:b", canvasId: "c" }), cameraStorageKey({ actorId: "a", canvasId: "b:c" }))
})

test("manual hierarchy navigation stops agent following and leaves original state unchanged", () => {
  const focused = { kind: "task" as const, workspaceId: "w", taskId: "a" }
  const following = navigateCanvas(createCanvasNavigation(scope), focused, "agent")
  assert.equal(following.followingAgent, true)
  const parent = parentCanvasFocus(following.focus)
  assert.deepEqual(parent, { kind: "workspace", workspaceId: "w" })
  assert.deepEqual(parentCanvasFocus(parent), { kind: "overview" })
  assert.deepEqual(parentCanvasFocus({ kind: "overview" }), { kind: "overview" })
  const manual = navigateCanvas(following, parent, "manual")
  assert.equal(manual.followingAgent, false)
  assert.equal(following.followingAgent, true)
  assert.equal(manual.selection, null)
})

test("removed authorization cannot retain inaccessible records or focus", () => {
  const focus = { kind: "task" as const, workspaceId: "private", taskId: "secret" }
  const navigation = { ...navigateCanvas(createCanvasNavigation(scope), focus, "agent"), selection: focus }
  const result = projectCanvas({ graphs: [graph([task("a")])], navigation, zoom: 1 })
  assert.deepEqual(result.navigation.focus, { kind: "overview" })
  assert.equal(result.navigation.selection, null)
  assert.equal(result.navigation.followingAgent, false)
  assert.equal(result.records.workspaces.has(workspaceNodeId("private")), false)
  assert.equal(result.nodes.some(node => node.workspaceId === "private"), false)
})

test("invalid camera scopes and zoom values fail instead of generating ambiguous state", () => {
  assert.throws(() => cameraStorageKey({ actorId: "", canvasId: "personal" }), /scope/i)
  for (const zoom of [0, -1, NaN, Infinity]) assert.throws(() => projectCanvas({ ...input([]), zoom }), /zoom/i)
})
