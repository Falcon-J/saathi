"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { Background, Controls, Handle, Position, ReactFlow, useStore, type Node, type NodeProps, type Viewport, type ReactFlowInstance } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Button } from "@/components/ui/button"
import { taskNodeId, workspaceNodeId, type CanvasFocus, type CanvasProjection, type CanvasRepresentation } from "@/features/canvas/model"
import { formatTaskDue } from "@/lib/task-time"
import type { AuthorizedCanvasResource } from "@/features/access/service"
import { containerNodeId, layoutCompanyResources, projectCanvasReferences } from "./company-layout"
import type { CanvasReference } from "@/features/access/contracts"
import type { Workspace } from "@/lib/data/workspaces"
import { canvasHandleStyle, canvasNodeGeometry } from "./node-geometry"

type NodeData = { title: string; subtitle?: string; description?: string; representation: CanvasRepresentation; kind: "workspace" | "task" | "container"; expanded: boolean; open: () => void }
type FlowNode = Node<NodeData, "workspace" | "task" | "container">

const CanvasRecord = memo(function CanvasRecord({ data }: NodeProps<FlowNode>) {
  const workspace = data.kind !== "task"
  return <article className={`h-full w-full overflow-hidden rounded-2xl border text-foreground shadow-sm ${workspace ? "border-border bg-card/85" : "border-primary/25 bg-card"}`}>
    <Handle type="target" position={Position.Left} style={canvasHandleStyle} isConnectable={false} />
    <div className={workspace ? "flex items-start justify-between gap-4 px-5 py-4" : "flex h-full flex-col gap-3 p-4"}>
      <div className={workspace ? "min-w-0" : "min-h-0 flex-1 overflow-hidden"}><h2 title={data.title} className={`line-clamp-2 break-words font-semibold tracking-tight ${workspace ? "text-lg" : "text-base"}`}>{data.title}</h2>
        {data.representation !== "compact" && data.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{data.subtitle}</p>}
        {data.representation === "detail" && data.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed">{data.description}</p>}
      </div>
      <Button size="sm" variant="outline" className={`nodrag nopan shrink-0 ${workspace ? "" : "mt-auto self-start"}`} onClick={event => { event.stopPropagation(); data.open() }} aria-label={`Open ${data.title}`}>Open</Button>
    </div>
    <Handle type="source" position={Position.Right} style={canvasHandleStyle} isConnectable={false} />
  </article>
})
const nodeTypes = { workspace: CanvasRecord, task: CanvasRecord, container: CanvasRecord }
const edgeOptions = { type: "smoothstep", style: { stroke: "var(--primary)", strokeWidth: 1.5 } }
const ariaLabels = {
  "node.a11yDescription.default": "Press Enter or Space to select this node. Tab to Open to inspect it.",
  "node.a11yDescription.keyboardDisabled": "Tab to Open to inspect this node.",
  "edge.a11yDescription.default": "Task prerequisite or canvas association. The connection name identifies its purpose.",
}

function readCamera(key: string): (Viewport & { canvasWidth?: number; canvasHeight?: number }) | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null")
    return parsed && [parsed.x, parsed.y, parsed.zoom].every(Number.isFinite) && parsed.zoom >= 0.15 && parsed.zoom <= 2
      ? { x: parsed.x, y: parsed.y, zoom: parsed.zoom, canvasWidth: parsed.canvasWidth, canvasHeight: parsed.canvasHeight } : null
  } catch { return null }
}

export default function CanvasFlow({ projection, cameraKey, onOpen, onZoom, onManualNavigation, resources, references = [], onOpenResource, workspaces, focus, followingAgent, ready = true }: {
  projection: CanvasProjection
  cameraKey: string
  onOpen: (focus: CanvasFocus) => void
  onZoom: (zoom: number) => void
  onManualNavigation: () => void
  resources: AuthorizedCanvasResource[]
  references?: CanvasReference[]
  workspaces: Workspace[]
  onOpenResource: (id: string) => void
  focus: CanvasFocus
  followingAgent: boolean
  ready?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const [initialCamera] = useState(() => readCamera(cameraKey))
  const flow = useRef<ReactFlowInstance<FlowNode> | null>(null)
  const [initialized, setInitialized] = useState(false)
  const canvasWidth = useStore(state => state.width)
  const canvasHeight = useStore(state => state.height)
  const previousSize = useRef<{ width: number; height: number } | null>(null)
  const pendingResize = useRef(false)
  const restoredCamera = useRef(false)
  const manualCamera = useRef(false)
  const resourceKey = resources.map(resource => resource.id).join("|")
  useEffect(() => {
    if (resourceKey && !restoredCamera.current && !manualCamera.current && focus.kind === "overview") {
      void flow.current?.fitView({ padding: 0.12, maxZoom: 1.2, duration: 0 })
    }
  }, [resourceKey, focus.kind])
  const focusKey = JSON.stringify(focus)
  const previousFocus = useRef(focusKey)
  const previousFollowing = useRef(followingAgent)
  const pendingFocus = useRef<string | null>(null)
  const focusReady = focus.kind === "overview" || (focus.kind === "resource" ? resources.some(record => record.id === focus.resourceId) : (focus.kind === "workspace"
    ? projection.records.workspaces.has(workspaceNodeId(focus.workspaceId))
    : projection.records.tasks.has(taskNodeId(focus.workspaceId, focus.taskId))))
  useEffect(() => {
    if (previousFocus.current !== focusKey || (followingAgent && !previousFollowing.current)) pendingFocus.current = focusKey
    else if (previousFollowing.current && !followingAgent) pendingFocus.current = null
    previousFocus.current = focusKey
    previousFollowing.current = followingAgent
    if (pendingFocus.current !== focusKey || !focusReady) return
    pendingFocus.current = null
    const focus: CanvasFocus = JSON.parse(focusKey)
    const id = focus.kind === "task" ? taskNodeId(focus.workspaceId, focus.taskId)
      : focus.kind === "workspace" ? workspaceNodeId(focus.workspaceId) : focus.kind === "resource" ? containerNodeId(focus.resourceId) : null
    // Instant camera changes also respect reduced-motion preferences.
    void flow.current?.fitView({ nodes: id ? [{ id }] : undefined, padding: 0.15, maxZoom: 1.2, duration: 0 })
  }, [focusKey, focusReady, followingAgent])
  useEffect(() => {
    if (!initialized || canvasWidth <= 0 || canvasHeight <= 0) return
    const previous = previousSize.current
    if (!previous) pendingResize.current = initialCamera?.canvasWidth !== canvasWidth || initialCamera?.canvasHeight !== canvasHeight
    else if (previous.width !== canvasWidth || previous.height !== canvasHeight) pendingResize.current = true
    previousSize.current = { width: canvasWidth, height: canvasHeight }
    if (!pendingResize.current || !ready || !focusReady) return
    pendingResize.current = false
    const current: CanvasFocus = JSON.parse(focusKey)
    const id = current.kind === "task" ? taskNodeId(current.workspaceId, current.taskId)
      : current.kind === "workspace" ? workspaceNodeId(current.workspaceId) : current.kind === "resource" ? containerNodeId(current.resourceId) : null
    void flow.current?.fitView({ nodes: id ? [{ id }] : undefined, padding: 0.15, maxZoom: 1.2, duration: 0 })
  }, [canvasWidth, canvasHeight, initialized, initialCamera, ready, focusReady, focusKey])
  const nodes = useMemo<FlowNode[]>(() => {
    const assigneeNames = new Map([...projection.records.workspaces.values()].flatMap(workspace => workspace.members.map(member => [member.email.toLowerCase(), member.username || member.email] as const)))
    const projected: FlowNode[] = projection.nodes.map(node => {
    const workspace = projection.records.workspaces.get(node.kind === "workspace" ? node.id : node.parentId!)!
    const task = node.kind === "task" ? projection.records.tasks.get(node.id)! : null
    const readiness = projection.readiness.get(node.workspaceId)
    const subtitle = task
      ? [node.readiness === "completed_inconsistent" ? "Review completed work" : node.readiness, task.assigneeEmail ? assigneeNames.get(task.assigneeEmail.toLowerCase()) ?? task.assigneeEmail : null, formatTaskDue(task.dueAt, task.dueDate, workspace.timezone)].filter(Boolean).join(" · ")
      : `${readiness?.ready.length ?? 0} ready · ${readiness?.waiting.length ?? 0} waiting`
    return { id: node.id, type: node.kind, position: node.position, parentId: node.parentId,
      hidden: node.hidden, draggable: false, selectable: true, ...canvasNodeGeometry(node.width, node.height),
      ariaLabel: `${task?.title ?? workspace.name}${subtitle ? `, ${subtitle}` : ""}`,
      data: { title: task?.title ?? workspace.name, description: task?.description ?? workspace.summary,
        subtitle, representation: node.representation, kind: node.kind, expanded: node.expanded,
        open: () => onOpen(task ? { kind: "task", workspaceId: node.workspaceId, taskId: task.id } : { kind: "workspace", workspaceId: node.workspaceId }) } }
    })
    const selected = projection.nodes.find(node => node.kind === "workspace")
    const hierarchy = layoutCompanyResources(resources, selected ? { workspaceId: selected.workspaceId, nodeId: selected.id, width: selected.width, height: selected.height } : undefined, workspaces)
    const existing = new Map(projected.map(node => [node.id, node]))
    const records = new Map(resources.map(record => [record.id, record]))
    const summaries = new Map(workspaces.map(workspace => [workspace.id, workspace]))
    return [...hierarchy.map(box => {
      const canonical = existing.get(box.id)
      if (canonical) return { ...canonical, parentId: box.parentId, position: box.position, ...canvasNodeGeometry(box.width, box.height) }
      const record = box.resourceId ? records.get(box.resourceId) : undefined
      const summary = box.workspaceId ? summaries.get(box.workspaceId) : undefined
      const title = record?.name ?? summary?.name ?? "Workspace"
      return { id: box.id, type: box.kind, position: box.position, parentId: box.parentId,
        draggable: false, selectable: true, ...canvasNodeGeometry(box.width, box.height), ariaLabel: `${record?.kind ?? "workspace"} ${title}`,
        data: { title, representation: "summary" as const, kind: box.kind, expanded: box.kind === "container",
          open: () => box.workspaceId ? onOpen({ kind: "workspace", workspaceId: box.workspaceId }) : onOpenResource(record!.id) } }
    }), ...projected.filter(node => node.type === "task")]
  }, [projection, onOpen, resources, onOpenResource, workspaces])
  const initialize = useCallback((instance: ReactFlowInstance<FlowNode>) => {
    flow.current = instance
    setInitialized(true)
    const camera = initialCamera
    restoredCamera.current = Boolean(camera)
    if (camera) void instance.setViewport(camera, { duration: 0 })
    else void instance.fitView({ padding: 0.12, duration: 0 })
  }, [initialCamera])
  const finishMove = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    onZoom(viewport.zoom)
    try { localStorage.setItem(cameraKey, JSON.stringify({ ...viewport, canvasWidth, canvasHeight })) } catch { /* Camera preferences are optional. */ }
  }, [cameraKey, onZoom, canvasWidth, canvasHeight])
  return <ReactFlow<FlowNode> nodes={nodes} edges={[...projection.edges, ...projectCanvasReferences(resources, references)]} nodeTypes={nodeTypes} defaultEdgeOptions={edgeOptions}
    onNodeClick={(_event, node) => node.data.open()}
    onPointerDownCapture={() => { manualCamera.current = true; pendingFocus.current = null; pendingResize.current = false; onManualNavigation() }}
    onKeyDownCapture={() => { manualCamera.current = true; pendingFocus.current = null; pendingResize.current = false; onManualNavigation() }}
    onInit={initialize} onMove={(_event, viewport) => onZoom(viewport.zoom)} onMoveEnd={finishMove}
    onMoveStart={event => { if (event) { manualCamera.current = true; pendingFocus.current = null; pendingResize.current = false; onManualNavigation() } }}
    nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} minZoom={0.15} maxZoom={2}
    defaultViewport={initialCamera ?? undefined} fitView={!initialCamera}
    nodesFocusable edgesFocusable disableKeyboardA11y={false} colorMode={resolvedTheme === "dark" ? "dark" : "light"} onlyRenderVisibleElements
    ariaLabelConfig={ariaLabels} proOptions={{ hideAttribution: false }}>
    <Background gap={24} size={1} /><Controls showInteractive={false} />
  </ReactFlow>
}
