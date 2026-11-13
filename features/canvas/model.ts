import type { Workspace } from "../../lib/data/workspaces.ts"
import type { TaskGraph } from "../../lib/data/task-dependencies.ts"
import type { Task } from "../../lib/task-contract.ts"
import { deriveNextWork, type NextWorkResult, type TaskDependency } from "../../lib/next-work.ts"

export type CanvasScope = Readonly<{ actorId: string; canvasId: string }>
export type CanvasResourcePath = Readonly<{ id: string; name: string; parentId: string | null; workspaceId?: string | null }>
export type CanvasFocus = { kind: "overview" } | { kind: "resource"; resourceId: string } | { kind: "workspace"; workspaceId: string }
  | { kind: "task"; workspaceId: string; taskId: string }
export type CanvasNavigation = {
  scope: CanvasScope
  focus: CanvasFocus
  selection: CanvasFocus | null
  followingAgent: boolean
}

/** Only supply successful, complete authorized getTaskGraph reads, never board pages.
 * The marker documents the caller's assertion; this pure module cannot authorize users.
 */
export type AuthorizedWorkspaceGraph = Readonly<{ workspace: Workspace; graph: TaskGraph; complete: true }>
export type CanvasRepresentation = "compact" | "summary" | "detail"
export type CanvasReadiness = "ready" | "waiting" | "completed_inconsistent" | "completed"
export type CanvasNode = {
  id: string
  kind: "workspace" | "task" | "readiness"
  recordId: string
  workspaceId: string
  parentId?: string
  position: { x: number; y: number }
  width: number
  height: number
  hidden: boolean
  expanded: boolean
  representation: CanvasRepresentation
  readiness?: CanvasReadiness
  count?: number
}
export type CanvasEdge = { id: string; source: string; target: string; workspaceId: string; hidden: boolean }
export type CanvasProjection = {
  navigation: CanvasNavigation
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  records: {
    workspaces: ReadonlyMap<string, Workspace>
    tasks: ReadonlyMap<string, Task>
    dependencies: ReadonlyMap<string, TaskDependency>
  }
  readiness: ReadonlyMap<string, NextWorkResult<Task>>
}

const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const keyPart = (value: string) => encodeURIComponent(value)
export const workspaceNodeId = (workspaceId: string) => `workspace:${keyPart(workspaceId)}`
export const taskNodeId = (workspaceId: string, taskId: string) => `task:${keyPart(workspaceId)}:${keyPart(taskId)}`
export const readinessNodeId = (workspaceId: string, readiness: CanvasReadiness) => `readiness:${keyPart(workspaceId)}:${readiness}`
export const dependencyEdgeId = (workspaceId: string, prerequisiteTaskId: string, dependentTaskId: string) =>
  `dependency:${keyPart(workspaceId)}:${keyPart(prerequisiteTaskId)}:${keyPart(dependentTaskId)}`

/** Personal camera preferences, not a shared layout or permission boundary. */
export function cameraStorageKey(scope: CanvasScope): string {
  if (!scope.actorId?.trim() || !scope.canvasId?.trim()) throw new Error("Canvas scope requires an actor and canvas")
  return `saathi:canvas-camera:${keyPart(scope.actorId)}:${keyPart(scope.canvasId)}`
}

export function createCanvasNavigation(scope: CanvasScope): CanvasNavigation {
  cameraStorageKey(scope)
  return { scope: { ...scope }, focus: { kind: "overview" }, selection: null, followingAgent: false }
}

/** Manual panning, zooming or hierarchy changes should call this, even with the same focus. */
export function navigateCanvas(state: CanvasNavigation, focus: CanvasFocus, source: "manual" | "agent"): CanvasNavigation {
  return { ...state, focus: { ...focus }, selection: null, followingAgent: source === "agent" }
}

export function resourcePath(id: string, resources: readonly CanvasResourcePath[]): CanvasResourcePath[] {
  const records = new Map(resources.map(record => [record.id, record]))
  const path: CanvasResourcePath[] = [], seen = new Set<string>()
  let record = records.get(id)
  while (record && !seen.has(record.id)) {
    seen.add(record.id); path.unshift(record)
    record = record.parentId ? records.get(record.parentId) : undefined
  }
  return path
}

export function parentCanvasFocus(focus: CanvasFocus, resources: readonly CanvasResourcePath[] = []): CanvasFocus {
  if (focus.kind === "task") return { kind: "workspace", workspaceId: focus.workspaceId }
  const record = focus.kind === "resource" ? resources.find(record => record.id === focus.resourceId)
    : focus.kind === "workspace" ? resources.find(record => record.workspaceId === focus.workspaceId) : undefined
  return record?.parentId && resources.some(parent => parent.id === record.parentId)
    ? { kind: "resource", resourceId: record.parentId } : { kind: "overview" }
}

export function canvasBreadcrumbs(focus: CanvasFocus, resources: readonly CanvasResourcePath[],
  workspaces: readonly Pick<Workspace, "id" | "name">[], tasks: readonly Pick<Task, "id" | "title">[]) {
  const result: { label: string; focus: CanvasFocus }[] = [{ label: "Canvas", focus: { kind: "overview" } }]
  const resource = focus.kind === "resource" ? resources.find(record => record.id === focus.resourceId)
    : focus.kind !== "overview" ? resources.find(record => record.workspaceId === focus.workspaceId) : undefined
  for (const record of resource ? resourcePath(resource.id, resources) : []) {
    if (!record.workspaceId) result.push({ label: record.name, focus: { kind: "resource", resourceId: record.id } })
  }
  if (focus.kind === "workspace" || focus.kind === "task") {
    const workspace = workspaces.find(record => record.id === focus.workspaceId)
    if (workspace) result.push({ label: workspace.name, focus: { kind: "workspace", workspaceId: workspace.id } })
    if (focus.kind === "task") {
      const task = tasks.find(record => record.id === focus.taskId)
      if (task) result.push({ label: task.title, focus })
    }
  }
  return result
}

function focusExists(focus: CanvasFocus, graphs: readonly AuthorizedWorkspaceGraph[], resources: readonly CanvasResourcePath[]): boolean {
  if (focus.kind === "overview") return true
  if (focus.kind === "resource") return resources.some(record => record.id === focus.resourceId)
  const entry = graphs.find(entry => entry.workspace.id === focus.workspaceId)
  return Boolean(entry && (focus.kind === "workspace" || entry.graph.tasks.some(task => task.id === focus.taskId)))
}

/** Call with the current authenticated scope, including after identity or authorization changes. */
export function reconcileCanvasNavigation(
  state: CanvasNavigation, scope: CanvasScope, graphs: readonly AuthorizedWorkspaceGraph[], resources: readonly CanvasResourcePath[] = [],
): CanvasNavigation {
  cameraStorageKey(scope)
  if (state.scope.actorId !== scope.actorId || state.scope.canvasId !== scope.canvasId) return createCanvasNavigation(scope)
  const validFocus = focusExists(state.focus, graphs, resources)
  const validSelection = !state.selection || focusExists(state.selection, graphs, resources)
  return { ...state, scope: { ...scope }, focus: validFocus ? { ...state.focus } : { kind: "overview" },
    selection: validSelection && state.selection ? { ...state.selection } : null,
    followingAgent: validFocus && validSelection && state.followingAgent }
}

const pointsAtWorkspace = (focus: CanvasFocus | null, workspaceId: string) =>
  Boolean(focus && (focus.kind === "workspace" || focus.kind === "task") && focus.workspaceId === workspaceId)
const pointsAtTask = (focus: CanvasFocus | null, workspaceId: string, taskId: string) =>
  Boolean(focus?.kind === "task" && focus.workspaceId === workspaceId && focus.taskId === taskId)

/** Deterministic automatic grid; positions are view output and are never written to canonical records.
 * All supplied workspaces are validated, including collapsed ones. Authorization is upstream.
 */
export function projectCanvas(input: {
  graphs: readonly AuthorizedWorkspaceGraph[]
  resources?: readonly CanvasResourcePath[]
  navigation: CanvasNavigation
  zoom: number
}): CanvasProjection {
  if (!Number.isFinite(input.zoom) || input.zoom <= 0) throw new Error("Canvas zoom must be finite and positive")
  const ordered = [...input.graphs].sort((a, b) => textOrder(a.workspace.id, b.workspace.id))
  const readiness = new Map<string, NextWorkResult<Task>>()
  const workspaces = new Map<string, Workspace>()
  const tasks = new Map<string, Task>()
  const dependencies = new Map<string, TaskDependency>()
  for (const entry of ordered) {
    if (entry.complete !== true) throw new Error("Canvas requires a complete authorized workspace graph")
    const { workspace, graph } = entry
    const id = workspaceNodeId(workspace.id)
    if (workspaces.has(id)) throw new Error("Canvas graph contains a duplicate workspace")
    if (graph.tasks.some(task => task.workspaceId !== workspace.id)
      || graph.dependencies.some(edge => edge.workspaceId !== workspace.id)) {
      throw new Error("Canvas graph crosses its workspace boundary")
    }
    // One consistent graph's clock and timezone feed the existing domain projection.
    readiness.set(workspace.id, deriveNextWork(graph.tasks, graph.dependencies, graph.timezone, new Date(graph.asOf)))
    workspaces.set(id, workspace)
    for (const task of graph.tasks) tasks.set(taskNodeId(workspace.id, task.id), task)
    for (const edge of graph.dependencies) dependencies.set(dependencyEdgeId(workspace.id, edge.prerequisiteTaskId, edge.dependentTaskId), edge)
  }
  const navigation = reconcileCanvasNavigation(input.navigation, input.navigation.scope, ordered, input.resources)
  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  // A fixed two-column grouping with row height derived from content avoids overlapping groups.
  const groups = ordered.map(entry => {
    const expanded = pointsAtWorkspace(navigation.focus, entry.workspace.id) || pointsAtWorkspace(navigation.selection, entry.workspace.id)
    const taskCount = entry.graph.tasks.length
    const dense = taskCount > 12
    const taskFocus = [navigation.focus, navigation.selection].find((focus): focus is Extract<CanvasFocus, { kind: "task" }> => focus?.kind === "task" && focus.workspaceId === entry.workspace.id)
    return { entry, expanded, dense, taskFocus, width: expanded ? dense ? 420 : 760 : 320,
      height: expanded ? dense ? taskFocus ? 352 : 448 : 100 + Math.ceil(taskCount / 2) * 240 : 160 }
  })
  let rowY = 0
  for (let index = 0; index < groups.length; index += 2) {
    const row = groups.slice(index, index + 2)
    let columnX = 0
    for (const { entry, expanded, dense, taskFocus, width, height } of row) {
      const { workspace, graph } = entry
      const id = workspaceNodeId(workspace.id)
      const projection = readiness.get(workspace.id)!
      const taskReadiness = new Map<string, CanvasReadiness>()
      for (const item of [...projection.ready, ...projection.waiting, ...projection.completedInconsistencies]) {
        taskReadiness.set(item.task.id, item.readiness)
      }
      nodes.push({ id, kind: "workspace", recordId: workspace.id, workspaceId: workspace.id,
        position: { x: columnX, y: rowY }, width, height, hidden: false, expanded,
        representation: expanded ? "detail" : input.zoom < 0.55 ? "compact" : "summary" })
      const orderedTasks = [...graph.tasks].sort((a, b) => textOrder(a.id, b.id))
      if (dense) {
        const counts: [CanvasReadiness, number][] = [["ready", projection.ready.length], ["waiting", projection.waiting.length],
          ["completed_inconsistent", projection.completedInconsistencies.length],
          ["completed", graph.tasks.length - projection.ready.length - projection.waiting.length - projection.completedInconsistencies.length]]
        counts.forEach(([readiness, count], index) => nodes.push({ id: readinessNodeId(workspace.id, readiness), kind: "readiness",
          recordId: workspace.id, workspaceId: workspace.id, parentId: id, position: { x: 24, y: 112 + index * 80 },
          width: 372, height: 64, hidden: !expanded || Boolean(taskFocus), expanded: false, representation: "summary", readiness, count }))
      }
      orderedTasks.forEach((task, taskIndex) => {
        const detail = pointsAtTask(navigation.focus, workspace.id, task.id) || pointsAtTask(navigation.selection, workspace.id, task.id)
        nodes.push({ id: taskNodeId(workspace.id, task.id), kind: "task", recordId: task.id,
          workspaceId: workspace.id, parentId: id, position: dense ? { x: 24, y: 112 } : { x: 24 + (taskIndex % 2) * 368, y: 80 + Math.floor(taskIndex / 2) * 240 },
          width: dense ? 372 : 344, height: 216, hidden: !expanded || (dense && taskFocus?.taskId !== task.id), expanded: detail,
          representation: detail ? "detail" : input.zoom < 0.55 ? "compact" : "summary",
          readiness: taskReadiness.get(task.id) ?? "completed" })
      })
      for (const edge of [...graph.dependencies].sort((a, b) => textOrder(
        dependencyEdgeId(workspace.id, a.prerequisiteTaskId, a.dependentTaskId),
        dependencyEdgeId(workspace.id, b.prerequisiteTaskId, b.dependentTaskId)))) {
        edges.push({ id: dependencyEdgeId(workspace.id, edge.prerequisiteTaskId, edge.dependentTaskId), workspaceId: workspace.id,
          source: taskNodeId(workspace.id, edge.prerequisiteTaskId), target: taskNodeId(workspace.id, edge.dependentTaskId), hidden: !expanded || dense })
      }
      columnX += width + 120
    }
    rowY += Math.max(...row.map(group => group.height)) + 120
  }
  return { navigation, nodes, edges, records: { workspaces, tasks, dependencies }, readiness }
}
