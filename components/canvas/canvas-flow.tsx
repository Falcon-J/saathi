"use client"

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { Background, Handle, Panel, Position, ReactFlow, type MarkerType, type Node, type NodeProps, type NodeChange } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Button } from "@/components/ui/button"
import { taskNodeId, workspaceNodeId, type CanvasFocus, type CanvasProjection, type CanvasReadiness, type CanvasRepresentation } from "@/features/canvas/model"
import { formatTaskDue } from "@/lib/task-time"
import type { AuthorizedCanvasResource } from "@/features/access/service"
import { containerNodeId, layoutCompanyResources, projectCanvasReferences } from "./company-layout"
import type { CanvasReference } from "@/features/access/contracts"
import type { Workspace } from "@/lib/data/workspaces"
import { canvasHandleStyle, canvasNodeGeometry } from "./node-geometry"

type NodeData = { title: string; subtitle?: string; description?: string; count?: number; relationship?: boolean; contextGroup?: boolean; focused?: boolean; representation: CanvasRepresentation; kind: "workspace" | "task" | "container" | "readiness"; expanded: boolean; open: () => void }
type FlowNode = Node<NodeData, "workspace" | "task" | "container" | "readiness">

const readinessLabels: Record<CanvasReadiness, string> = { ready: "Ready", waiting: "Waiting", completed_inconsistent: "Review", completed: "Completed" }

const CanvasRecord = memo(function CanvasRecord({ data }: NodeProps<FlowNode>) {
  if (data.contextGroup) return null
  if (data.kind === "readiness") return <Button variant="outline" className="nodrag nopan h-full w-full justify-between rounded-2xl px-5 text-base" onClick={event => { event.stopPropagation(); data.open() }} aria-label={`Open ${data.title}, ${data.count} tasks`}>
    <span>{data.title}</span><span className="tabular-nums">{data.count}</span>
  </Button>
  if (data.relationship) return <article className={`h-full w-full rounded-xl border bg-card shadow-sm ${data.focused ? "border-2 border-primary" : "border-border"}`}>
    <Handle type="target" position={Position.Top} style={canvasHandleStyle} isConnectable={false} />
    <Button variant="ghost" className="nodrag nopan h-full w-full flex-col items-start justify-center gap-3 whitespace-normal rounded-xl p-4 text-left" aria-label={`Open ${data.title}`} onClick={event => { event.stopPropagation(); data.open() }}>
      <h2 className="line-clamp-2 break-words text-base font-semibold">{data.title}</h2><span className="line-clamp-1 text-sm text-muted-foreground">{data.subtitle}</span>
    </Button>
    <Handle type="source" position={Position.Bottom} style={canvasHandleStyle} isConnectable={false} />
  </article>
  const workspace = data.kind !== "task"
  const container = data.kind === "container"
  return <article className={`h-full w-full overflow-hidden rounded-2xl border text-foreground ${container ? "border-dashed border-border bg-muted/10" : workspace ? "border-border bg-card/95 shadow-sm" : "border-primary/25 bg-card shadow-sm"}`}>
    <Handle type="target" position={Position.Left} style={canvasHandleStyle} isConnectable={false} />
    <div className={workspace ? "flex h-28 items-start justify-between gap-4 overflow-hidden px-5 py-4" : "flex h-full flex-col gap-3 p-4"}>
      <div className={workspace ? "min-w-0" : "min-h-0 flex-1 overflow-hidden"}><h2 title={data.title} className={`line-clamp-2 break-words font-semibold tracking-tight ${workspace ? "text-lg" : "text-base"}`}><button type="button" className="nodrag nopan cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={event => { event.stopPropagation(); data.open() }}>{data.title}</button></h2>
        {data.representation !== "compact" && data.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{data.subtitle}</p>}
        {!workspace && data.representation === "detail" && data.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed">{data.description}</p>}
      </div>
      <Button size="sm" variant="outline" className={`nodrag nopan shrink-0 ${workspace ? "" : "mt-auto self-start"}`} onClick={event => { event.stopPropagation(); data.open() }} aria-label={`Open ${data.title}`}>Open</Button>
    </div>
    <Handle type="source" position={Position.Right} style={canvasHandleStyle} isConnectable={false} />
  </article>
})
const nodeTypes = { workspace: CanvasRecord, task: CanvasRecord, container: CanvasRecord, readiness: CanvasRecord }
const edgeOptions = { type: "smoothstep", markerEnd: { type: "arrowclosed" as MarkerType }, style: { stroke: "var(--primary)", strokeWidth: 1.5 } }
const ariaLabels = {
  "node.a11yDescription.default": "Press Enter or Space to select this node. Tab to Open to inspect it.",
  "node.a11yDescription.keyboardDisabled": "Tab to Open to inspect this node.",
  "edge.a11yDescription.default": "Task prerequisite or canvas association. The connection name identifies its purpose.",
}

import { CanvasCamera, type CanvasCameraHandle, type CanvasTool } from "./canvas-camera"
import { readCanvasCamera, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM } from "./camera-utils"
export default function CanvasFlow({ projection, cameraKey, onOpen, onOpenGroup, onZoom, onViewportWidthChange, onManualNavigation, resources, references = [], onOpenResource, workspaces, focus, followingAgent, ready = true, restoreReady = true, compact }: {
  projection: CanvasProjection
  cameraKey: string
  onOpen: (focus: CanvasFocus) => void
  onOpenGroup: (workspaceId: string, readiness: CanvasReadiness) => void
  onZoom: (zoom: number) => void
  onViewportWidthChange: (width: number) => void
  onManualNavigation: () => void
  resources: AuthorizedCanvasResource[]
  references?: CanvasReference[]
  workspaces: Workspace[]
  onOpenResource: (id: string) => void
  focus: CanvasFocus
  followingAgent: boolean
  compact?: boolean
  restoreReady?: boolean
  ready?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const [initialCamera] = useState(() => readCanvasCamera(cameraKey, JSON.stringify(focus)))
  const controller = useRef<CanvasCameraHandle | null>(null)
  const events = useRef({ onOpen, onOpenResource, onOpenGroup })
  useLayoutEffect(() => { events.current = { onOpen, onOpenResource, onOpenGroup } }, [onOpen, onOpenResource, onOpenGroup])
  const [tool, setTool] = useState<CanvasTool>("select")
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const baseNodes = useMemo<FlowNode[]>(() => {
    const taskFocus = focus.kind === "task" ? focus : null
    const assigneeNames = new Map([...projection.records.workspaces.values()].flatMap(workspace => workspace.members.map(member => [member.email.toLowerCase(), member.username || member.email] as const)))
    const projected: FlowNode[] = projection.nodes.map(node => {
    const workspace = projection.records.workspaces.get(node.kind === "workspace" ? node.id : node.parentId!)!
    const task = node.kind === "task" ? projection.records.tasks.get(node.id)! : null
    const readiness = projection.readiness.get(node.workspaceId)
    const grouped = node.kind === "workspace" && projection.nodes.some(child => child.parentId === node.id && child.kind === "readiness")
    if (node.kind === "readiness") {
      const title = readinessLabels[node.readiness!]
      return { id: node.id, type: node.kind, position: node.position, parentId: node.parentId,
        hidden: node.hidden, draggable: false, selectable: true, ...canvasNodeGeometry(node.width, node.height, node.relationship),
        ariaLabel: `${title}, ${node.count} tasks`, data: { title, count: node.count, representation: node.representation,
          kind: node.kind, expanded: false, open: () => events.current.onOpenGroup(node.workspaceId, node.readiness!) } }
    }
    const subtitle = task
      ? [node.readiness === "completed_inconsistent" ? "Review completed work" : node.readiness, task.assigneeEmail ? assigneeNames.get(task.assigneeEmail.toLowerCase()) ?? task.assigneeEmail : null, formatTaskDue(task.dueAt, task.dueDate, workspace.timezone)].filter(Boolean).join(" · ")
      : grouped ? undefined : `${readiness?.ready.length ?? 0} ready · ${readiness?.waiting.length ?? 0} waiting`
    const contextGroup = Boolean(taskFocus && node.kind === "workspace")
    return { id: node.id, type: node.kind, position: node.position, parentId: node.parentId,
      hidden: node.hidden, draggable: false, selectable: !contextGroup, focusable: !contextGroup, ...(contextGroup ? { style: { pointerEvents: "none" as const } } : {}), ...canvasNodeGeometry(node.width, node.height, node.relationship),
      ariaLabel: contextGroup ? undefined : `${task?.title ?? workspace.name}${subtitle ? `, ${subtitle}` : ""}`,
      data: { title: task?.title ?? workspace.name, relationship: node.relationship, contextGroup, focused: taskFocus?.taskId === task?.id, description: grouped ? undefined : task?.description ?? workspace.summary,
        subtitle, representation: node.representation, kind: node.kind, expanded: node.expanded,
        open: () => events.current.onOpen(task ? { kind: "task", workspaceId: node.workspaceId, taskId: task.id } : { kind: "workspace", workspaceId: node.workspaceId }) } }
    })
    if (taskFocus) return projected.filter(node => node.id === workspaceNodeId(taskFocus.workspaceId) || (node.type === "task" && node.parentId === workspaceNodeId(taskFocus.workspaceId)))
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
          open: () => box.workspaceId ? events.current.onOpen({ kind: "workspace", workspaceId: box.workspaceId }) : events.current.onOpenResource(record!.id) } }
    }), ...projected.filter(node => node.type === "task" || node.type === "readiness")]
  }, [projection, resources, workspaces, focus])
  const nodes = useMemo(() => baseNodes.map(node => selectedIds.has(node.id) ? { ...node, selected: true } : node), [baseNodes, selectedIds])
  const changeNodes = useCallback((changes: NodeChange<FlowNode>[]) => {
    const selections = changes.filter(change => change.type === "select")
    if (!selections.length) return
    setSelectedIds(current => {
      const next = new Set(current)
      for (const change of selections) { if (change.selected) next.add(change.id); else next.delete(change.id) }
      return next.size === current.size && [...next].every(id => current.has(id)) ? current : next
    })
  }, [])
  const edges = useMemo(() => focus.kind === "task" ? projection.edges : [...projection.edges, ...projectCanvasReferences(resources, references)], [projection.edges, resources, references, focus.kind])
  const focusedTaskId = focus.kind === "task" ? taskNodeId(focus.workspaceId, focus.taskId) : ""
  const contextIds = useMemo(() => {
    const selected = nodes.find(node => node.id === focusedTaskId && node.data.relationship)
    if (!selected) return undefined
    const byId = new Map(nodes.map(node => [node.id, node]))
    const completed = (id: string) => { const task = projection.records.tasks.get(id); return Boolean(task?.completed || task?.status === "done") }
    const distance = (id: string) => Math.abs((byId.get(id)?.position.y ?? selected.position.y) - selected.position.y)
    const rank = (a: string, b: string) => Number(completed(a)) - Number(completed(b)) || distance(a) - distance(b) || (a < b ? -1 : a > b ? 1 : 0)
    const before = [...new Set(projection.edges.filter(edge => !edge.hidden && edge.target === focusedTaskId).map(edge => edge.source))].sort(rank)
    const after = [...new Set(projection.edges.filter(edge => !edge.hidden && edge.source === focusedTaskId).map(edge => edge.target))].sort(rank)
    return [...before.slice(0, compact ? 1 : 4), focusedTaskId, ...after.slice(0, compact ? 0 : 2)]
  }, [nodes, projection.edges, projection.records.tasks, focusedTaskId, compact])
  const cancelPending = useCallback(() => controller.current?.cancelPending(), [])
  const keyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => controller.current?.keyDown(event), [])
  const moveStart = useCallback((event: MouseEvent | TouchEvent | null) => { if (event) controller.current?.cancelPending() }, [])
  return <ReactFlow<FlowNode> nodes={nodes} edges={edges} onNodesChange={changeNodes} onNodeDoubleClick={(_event, node) => node.data.open()} nodeTypes={nodeTypes} defaultEdgeOptions={edgeOptions}
    onPointerDownCapture={cancelPending} onKeyDownCapture={keyDown} onMoveStart={moveStart}
    selectionOnDrag={tool === "select"} panOnDrag={tool === "pan" ? true : [1, 2]} panActivationKeyCode="Space" panOnScroll
    zoomOnScroll={false} zoomOnPinch zoomActivationKeyCode={["Control", "Meta"]}
    nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} minZoom={MIN_CANVAS_ZOOM} maxZoom={MAX_CANVAS_ZOOM}
    defaultViewport={initialCamera ?? undefined} fitView={false}
    nodesFocusable edgesFocusable disableKeyboardA11y={false} colorMode={resolvedTheme === "dark" ? "dark" : "light"} onlyRenderVisibleElements
    ariaLabelConfig={ariaLabels} proOptions={{ hideAttribution: false }}>
    <Background gap={24} size={1} />
    {Boolean(projection.omittedTaskCount) && <Panel position="top-right" className="!m-3 max-w-52"><p role="status" className="rounded-lg border border-border bg-card p-2 text-xs">{projection.omittedTaskCount} more blockers. Open Task details to inspect all prerequisites.</p></Panel>}
    <CanvasCamera contextIds={contextIds} nodes={nodes} focus={focus} followingAgent={followingAgent} cameraKey={cameraKey} initialCamera={initialCamera} compact={compact} restoreReady={restoreReady} ready={ready} onViewportWidthChange={onViewportWidthChange}
      controllerRef={controller} tool={tool} onToolChange={setTool} onZoom={onZoom} onManualNavigation={onManualNavigation} />
  </ReactFlow>
}
