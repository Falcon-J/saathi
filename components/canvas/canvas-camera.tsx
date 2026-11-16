"use client"

import { useCallback, useEffect, useImperativeHandle, useRef, type KeyboardEvent, type Ref } from "react"
import { getViewportForBounds, Panel, useInternalNode, useOnViewportChange, useReactFlow, useStore, type Node, type Viewport } from "@xyflow/react"
import { Focus, Hand, Maximize2, Minus, MousePointer2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { taskNodeId, workspaceNodeId, type CanvasFocus } from "@/features/canvas/model"
import { containerNodeId } from "./company-layout"
import { MIN_CANVAS_ZOOM, formatCanvasZoom, restoreCanvasCamera, readCanvasCamera, type SavedCanvasCamera } from "./camera-utils"

export type CanvasTool = "select" | "pan"
export type CanvasCameraHandle = { cancelPending: () => void; keyDown: (event: KeyboardEvent<HTMLDivElement>) => void }

/** Store subscriptions stay below ReactFlow; camera updates never rebuild its controlled records. */
export function CanvasCamera({ contextIds, nodes, focus, followingAgent, cameraKey, initialCamera, controllerRef, tool, onToolChange, onZoom, onManualNavigation, onViewportWidthChange, ready = true, restoreReady = true, compact }: {
  contextIds?: string[]
  nodes: Node[]; focus: CanvasFocus; followingAgent: boolean; cameraKey: string; initialCamera: SavedCanvasCamera | null
  controllerRef: Ref<CanvasCameraHandle>; tool: CanvasTool; onToolChange: (tool: CanvasTool) => void
  onViewportWidthChange: (width: number) => void; ready?: boolean; restoreReady?: boolean; compact?: boolean
  onZoom: (zoom: number) => void; onManualNavigation: () => void
}) {
  const flow = useReactFlow()
  const zoom = useStore(state => state.transform[2])
  const width = useStore(state => state.width)
  const height = useStore(state => state.height)
  useEffect(() => { if (width > 0) onViewportWidthChange(width) }, [width, onViewportWidthChange])
  const key = JSON.stringify(focus)
  const initialKey = useRef(key)
  const previous = useRef({ key, followingAgent, resources: nodes.filter(node => node.type !== "task").map(node => node.id).join("|") })
  const pending = useRef<string | null>(focus.kind !== "overview" || !initialCamera ? key : null)
  const initialized = useRef(false)
  const manual = useRef(false)
  const interacted = useRef(false)
  const generation = useRef(0)
  const focusId = focus.kind === "task" ? taskNodeId(focus.workspaceId, focus.taskId) : focus.kind === "workspace" ? workspaceNodeId(focus.workspaceId) : focus.kind === "resource" ? containerNodeId(focus.resourceId) : ""
  const selectedIds = nodes.filter(node => node.selected && !node.hidden).map(node => node.id)
  const input = focusId ? nodes.find(node => node.id === focusId) : nodes.find(node => !node.hidden)
  const internal = useInternalNode(input?.id ?? "")
  const layoutReady = (compact === undefined || compact === (width < 640)) && Boolean(input && internal && !internal.hidden && internal.internals.userNode === input)
  const resources = nodes.filter(node => node.type !== "task").map(node => node.id).join("|")
  const fit = useCallback((ids: string[]) => ids.length ? flow.fitBounds(flow.getNodesBounds(ids), { padding: .15, duration: 0 }) : Promise.resolve(false), [flow])
  const fitContext = useCallback((ids: string[]) => width > 0 && height > 0
    ? flow.setViewport(getViewportForBounds(flow.getNodesBounds(ids), width, height, MIN_CANVAS_ZOOM, 1, .15), { duration: 0 })
    : Promise.resolve(false), [flow, width, height])
  const fitAll = useCallback(() => fit(nodes.filter(node => !node.hidden && node.data?.contextGroup !== true).map(node => node.id)), [nodes, fit])
  const cancelPending = useCallback(() => { manual.current = true; interacted.current = true; pending.current = null; generation.current++; onManualNavigation() }, [onManualNavigation])
  const setTool = useCallback((next: CanvasTool) => { cancelPending(); onToolChange(next) }, [cancelPending, onToolChange])
  useImperativeHandle(controllerRef, () => ({ cancelPending, keyDown(event) {
    const target = event.target as HTMLElement
    if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
    cancelPending()
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key.toLowerCase() === "h" || event.key.toLowerCase() === "v") {
      event.preventDefault(); onToolChange(event.key.toLowerCase() === "h" ? "pan" : "select")
    }
  } }), [cancelPending, onToolChange])
  useOnViewportChange({
    onChange: useCallback((viewport: Viewport) => onZoom(viewport.zoom), [onZoom]),
    onEnd: useCallback((viewport: Viewport) => { try { if (!restoreReady || !initialized.current) return; localStorage.setItem(cameraKey, JSON.stringify({ ...viewport, focusKey: key, canvasWidth: width, canvasHeight: height })) } catch { /* Camera preferences are optional. */ } }, [cameraKey, key, width, height, restoreReady]),
  })
  const geometry = input ? `${input.width}:${input.height}:${input.position.x}:${input.position.y}` : ""
  const previousLayout = useRef({ width, height, focusId, geometry })
  useEffect(() => {
    const changed = previous.current.key !== key
    const newIntent = changed || (followingAgent && !previous.current.followingAgent)
    if (newIntent) manual.current = false
    const last = previousLayout.current
    const resized = last.width !== width || last.height !== height
    const reshaped = last.focusId === focusId && last.geometry && last.geometry !== geometry
    previousLayout.current = { width, height, focusId, geometry }
    if (resized || (reshaped && !manual.current)) { pending.current = key; generation.current++ }
    if (newIntent) { pending.current = key; generation.current++ }
    else if (previous.current.followingAgent && !followingAgent) { pending.current = null; generation.current++ }
    if (resources !== previous.current.resources && resources && !manual.current && !initialCamera && focus.kind === "overview") pending.current = key
    previous.current = { key, followingAgent, resources }
    if (!restoreReady || !ready || !flow.viewportInitialized || !layoutReady) return
    if (!initialized.current) {
      initialized.current = true
      const saved = key === initialKey.current ? initialCamera : readCanvasCamera(cameraKey, key)
      const responsiveLayoutChanged = saved?.canvasWidth !== undefined && compact !== undefined && (saved.canvasWidth < 640) !== compact
      if (saved && !responsiveLayoutChanged && !interacted.current) { pending.current = null; void flow.setViewport(restoreCanvasCamera(saved, width, height), { duration: 0 }); return }
    }
    if (pending.current !== key) return
    // Claim this camera intent before a synchronous viewport/store notification can re-enter.
    pending.current = null
    const request = generation.current
    const result = focusId ? contextIds?.length ? fitContext(contextIds) : fit([focusId]) : fitAll()
    void result.then(applied => { if (!applied && request === generation.current && previous.current.key === key) pending.current = key })
      .catch(() => { if (request === generation.current && previous.current.key === key) pending.current = key })
  }, [contextIds, compact, restoreReady, cameraKey, ready, key, focus.kind, focusId, followingAgent, resources, initialCamera, flow, layoutReady, internal, fit, fitContext, fitAll, width, height, geometry])
  return <>
    <Panel position="bottom-left" className="!m-3"><div role="toolbar" aria-label="Canvas zoom" className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-sm">
      <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => { cancelPending(); void flow.zoomOut({ duration: 0 }) }}><Minus className="size-4" /></Button>
      <Button variant="ghost" size="sm" className="min-w-14 tabular-nums" aria-label={`Zoom ${formatCanvasZoom(zoom)}. Reset to 100%`} onClick={() => { cancelPending(); void flow.zoomTo(1, { duration: 0 }) }}>{formatCanvasZoom(zoom)}</Button>
      <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => { cancelPending(); void flow.zoomIn({ duration: 0 }) }}><Plus className="size-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Fit View" title="Fit canvas" onClick={() => { cancelPending(); void fitAll() }}><Maximize2 className="size-4" /></Button>
      {(selectedIds.length > 0 || focusId) && <Button variant="ghost" size="icon" aria-label="Focus selected work" onClick={() => { cancelPending(); void fit(selectedIds.length ? selectedIds : [focusId]) }}><Focus className="size-4" /></Button>}
    </div></Panel>
    <Panel position="bottom-right" className="!m-3"><div role="toolbar" aria-label="Canvas tools" className="flex gap-0.5 rounded-xl border border-border bg-card p-1 shadow-sm">
      <Button variant={tool === "select" ? "secondary" : "ghost"} size="icon" aria-label="Select tool" title="Select (V)" aria-pressed={tool === "select"} onClick={() => setTool("select")}><MousePointer2 className="size-4" /></Button>
      <Button variant={tool === "pan" ? "secondary" : "ghost"} size="icon" aria-label="Pan tool" title="Pan (H), or hold Space" aria-pressed={tool === "pan"} onClick={() => setTool("pan")}><Hand className="size-4" /></Button>
    </div></Panel>
  </>
}
