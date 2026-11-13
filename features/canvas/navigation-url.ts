import type { CanvasFocus } from "./model.ts"

export const CANVAS_TOOLS = ["ready", "tasks", "prerequisites", "team", "settings", "activity", "agents"] as const
export type CanvasTool = typeof CANVAS_TOOLS[number]
export type CanvasLocation = { focus: CanvasFocus; view: CanvasTool | null; group: "ready" | "waiting" | "completed_inconsistent" | null }
const keys = ["resource", "workspace", "task", "view", "group"]
const id = (value: string | null) => value !== null && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)

/** Selectors only. The caller must resolve against current authenticated reads. */
export function parseCanvasUrl(input: string): CanvasLocation | null {
  if (input.length > 8192) return null
  let url: URL
  try { url = new URL(input, "https://canvas.invalid") } catch { return null }
  const p = url.searchParams
  if (keys.some(key => p.getAll(key).length > 1)) return null
  const resource = p.get("resource"), workspace = p.get("workspace"), task = p.get("task"), view = p.get("view"), group = p.get("group")
  if ((resource !== null && !id(resource)) || (workspace !== null && !id(workspace)) || (task !== null && !id(task))) return null
  if ((resource && workspace) || (task && !workspace) || (view !== null && !CANVAS_TOOLS.includes(view as CanvasTool)) || (view && !workspace)) return null
  if (group !== null && (view !== "ready" || !["ready", "waiting", "completed_inconsistent"].includes(group))) return null
  const focus: CanvasFocus = resource ? { kind: "resource", resourceId: resource } : task && workspace ? { kind: "task", workspaceId: workspace, taskId: task }
    : workspace ? { kind: "workspace", workspaceId: workspace } : { kind: "overview" }
  return { focus, view: view as CanvasTool | null, group: group as CanvasLocation["group"] }
}

export function canvasUrl(location: CanvasLocation, base = "/canvas"): string {
  const url = new URL(base, "https://canvas.invalid")
  keys.forEach(key => url.searchParams.delete(key))
  const { focus } = location
  if (focus.kind === "resource") url.searchParams.set("resource", focus.resourceId)
  if (focus.kind === "workspace" || focus.kind === "task") {
    url.searchParams.set("workspace", focus.workspaceId)
    if (focus.kind === "task") url.searchParams.set("task", focus.taskId)
    if (location.view) url.searchParams.set("view", location.view)
    if (location.view === "ready" && location.group) url.searchParams.set("group", location.group)
  }
  return url.pathname + url.search + url.hash
}

export function resolveCanvasUrl(location: CanvasLocation, authority: {
  loading: boolean; error: boolean; workspaceIds: readonly string[]; resourceIds: readonly string[];
  currentWorkspaceId: string | null; graphWorkspaceId: string | null; graphLoading: boolean; graphError: boolean; taskIds: readonly string[];
}): { kind: "wait" | "ready" | "unavailable" } | { kind: "select"; workspaceId: string } {
  if (authority.loading || authority.error) return { kind: "wait" }
  const focus = location.focus
  if (focus.kind === "overview") return { kind: "ready" }
  if (focus.kind === "resource") return { kind: authority.resourceIds.includes(focus.resourceId) ? "ready" : "unavailable" }
  if (!authority.workspaceIds.includes(focus.workspaceId)) return { kind: "unavailable" }
  if (authority.currentWorkspaceId !== focus.workspaceId) return { kind: "select", workspaceId: focus.workspaceId }
  if (authority.graphLoading) return { kind: "wait" }
  if (authority.graphError) return { kind: "unavailable" }
  if (authority.graphWorkspaceId !== focus.workspaceId) return { kind: "wait" }
  return { kind: focus.kind === "task" && !authority.taskIds.includes(focus.taskId) ? "unavailable" : "ready" }
}
