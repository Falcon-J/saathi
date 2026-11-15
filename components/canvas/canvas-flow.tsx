"use client"

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { Background, Handle, Position, ReactFlow, type Node, type NodeChange, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Button } from "@/components/ui/button"
import { taskNodeId, workspaceNodeId, type CanvasFocus, type CanvasProjection, type CanvasRepresentation } from "@/features/canvas/model"
import { formatTaskDue } from "@/lib/task-time"
import type { AuthorizedCanvasResource } from "@/features/access/service"
import { layoutCompanyResources, projectCanvasReferences } from "./company-layout"
import type { CanvasReference } from "@/features/access/contracts"
import type { Workspace } from "@/lib/data/workspaces"
import { CanvasCamera, type CanvasCameraHandle, type CanvasTool } from "./canvas-camera"
import { MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM, readCanvasCamera } from "./camera-utils"
import { canvasHandleStyle, canvasNodeGeometry } from "./node-geometry"

type NodeData = { title: string; subtitle?: string; description?: string; representation: CanvasRepresentation; kind: "workspace" | "task" | "container"; expanded: boolean; open: () => void }
type FlowNode = Node<NodeData, "workspace" | "task" | "container">

const CanvasRecord = memo(function CanvasRecord({ data, selected }: NodeProps<FlowNode>) {
  const workspace = data.kind !== "task"
  return <article className={`h-full w-full overflow-hidden rounded-2xl border text-foreground ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${workspace ? "border-border bg-card" : "border-primary/25 bg-card shadow-sm"}`}>
    <Handle type="target" position={Position.Left} style={canvasHandleStyle} isConnectable={false} />
    <div className={workspace ? "flex items-start justify-between gap-4 px-5 py-4" : "space-y-3 p-4"}>
      <div className="min-w-0"><h2 className={`break-words font-semibold tracking-tight ${workspace ? "text-lg" : "text-base"}`}>{data.title}</h2>
        {data.representation !== "compact" && data.subtitle && <p className="mt-1 text-sm text-muted-foreground">{data.subtitle}</p>}
        {data.representation === "detail" && data.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed">{data.description}</p>}
      </div>
      <Button size="sm" variant="outline" className="nodrag nopan shrink-0" onClick={data.open} aria-label={`Open ${data.title}`}>Open</Button>
    </div>
    <Handle type="source" position={Position.Right} style={canvasHandleStyle} isConnectable={false} />
  </article>
})
const nodeTypes = { workspace: CanvasRecord, task: CanvasRecord, container: CanvasRecord }
const edgeOptions = { type: "smoothstep", style: { stroke: "var(--primary)", strokeWidth: 1.5 } }
const noReferences: CanvasReference[] = []
const ariaLabels = {
  "node.a11yDescription.default": "Press Enter or Space to select this node. Tab to Open to inspect it.",
  "node.a11yDescription.keyboardDisabled": "Tab to Open to inspect this node.",
  "edge.a11yDescription.default": "Task prerequisite or canvas association. The connection name identifies its purpose.",
}

export default function CanvasFlow({ projection, cameraKey, onOpen, onZoom, onManualNavigation, resources, references = noReferences, onOpenResource, workspaces, focus, followingAgent }: {
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
}) {
  const { resolvedTheme } = useTheme()
  const [initialCamera] = useState(() => readCanvasCamera(cameraKey, JSON.stringify(focus)))
  const controller = useRef<CanvasCameraHandle | null>(null)
  const events = useRef({ onOpen, onOpenResource })
  useLayoutEffect(() => { events.current = { onOpen, onOpenResource } }, [onOpen, onOpenResource])
  const [tool, setTool] = useState<CanvasTool>("select")
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const baseNodes = useMemo<FlowNode[]>(() => {
    const projected: FlowNode[] = projection.nodes.map(node => {
    const workspace = projection.records.workspaces.get(node.kind === "workspace" ? node.id : node.parentId!)!
    const task = node.kind === "task" ? projection.records.tasks.get(node.id)! : null
    const readiness = projection.readiness.get(node.workspaceId)
    const subtitle = task
      ? [node.readiness === "completed_inconsistent" ? "Review completed work" : node.readiness, task.assigneeEmail, formatTaskDue(task.dueAt, task.dueDate, workspace.timezone)].filter(Boolean).join(" · ")
      : `${readiness?.ready.length ?? 0} ready · ${readiness?.waiting.length ?? 0} waiting`
    return { id: node.id, type: node.kind, position: node.position, parentId: node.parentId,
      hidden: node.hidden, draggable: false, selectable: true, ...canvasNodeGeometry(node.width, node.height),
      ariaLabel: `${task?.title ?? workspace.name}${subtitle ? `, ${subtitle}` : ""}`,
      data: { title: task?.title ?? workspace.name, description: task?.description ?? workspace.summary,
        subtitle, representation: node.representation, kind: node.kind, expanded: node.expanded,
        open: () => events.current.onOpen(task ? { kind: "task", workspaceId: node.workspaceId, taskId: task.id } : { kind: "workspace", workspaceId: node.workspaceId }) } }
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
          open: () => box.workspaceId ? events.current.onOpen({ kind: "workspace", workspaceId: box.workspaceId }) : events.current.onOpenResource(record!.id) } }
    }), ...projected.filter(node => node.type === "task")]
  }, [projection, resources, workspaces])
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
  const edges = useMemo(() => [...projection.edges, ...projectCanvasReferences(resources, references)], [projection.edges, resources, references])
  const cancelPending = useCallback(() => controller.current?.cancelPending(), [])
  const keyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => controller.current?.keyDown(event), [])
  const moveStart = useCallback((event: MouseEvent | TouchEvent | null) => { if (event) controller.current?.cancelPending() }, [])
  return <ReactFlow<FlowNode> nodes={nodes} edges={edges} onNodesChange={changeNodes} nodeTypes={nodeTypes} defaultEdgeOptions={edgeOptions}
    onPointerDownCapture={cancelPending} onKeyDownCapture={keyDown} onMoveStart={moveStart}
    selectionOnDrag={tool === "select"} panOnDrag={tool === "pan" ? true : [1, 2]} panActivationKeyCode="Space" panOnScroll
    zoomOnScroll={false} zoomOnPinch zoomActivationKeyCode={["Control", "Meta"]}
    nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} minZoom={MIN_CANVAS_ZOOM} maxZoom={MAX_CANVAS_ZOOM}
    defaultViewport={initialCamera ?? undefined} fitView={false}
    nodesFocusable edgesFocusable disableKeyboardA11y={false} colorMode={resolvedTheme === "dark" ? "dark" : "light"} onlyRenderVisibleElements
    ariaLabelConfig={ariaLabels} proOptions={{ hideAttribution: false }}>
    <Background gap={24} size={1} />
    <CanvasCamera nodes={nodes} focus={focus} followingAgent={followingAgent} cameraKey={cameraKey} initialCamera={initialCamera}
      controllerRef={controller} tool={tool} onToolChange={setTool} onZoom={onZoom} onManualNavigation={onManualNavigation} />
  </ReactFlow>
}
