"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { ArrowLeft, Building2, ChevronDown, List, Map as MapIcon, MoreHorizontal, Plus, RefreshCw } from "lucide-react"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useCanvasGraph } from "@/hooks/use-canvas-graph"
import { WorkspaceBoard } from "@/components/workspace-board"
import { WorkspaceCreateForm } from "@/components/workspace-create-form"
import { NextWorkView } from "@/components/next-work-view"
import { MemberManager } from "@/components/member-manager"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { ActivityHistory } from "@/components/activity-history"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CanvasCommandBar } from "./canvas-command-bar"
import { ContextualWorkspaceCreate, type WorkspaceCreationTarget } from "./contextual-workspace-create"
import { CompanyPanel } from "./company-panel"
import { useCanvasResources } from "./use-canvas-resources"
import { AgentActivity } from "./agent-activity"
import { canvasBreadcrumbs, cameraStorageKey, createCanvasNavigation, navigateCanvas, parentCanvasFocus, projectCanvas,
  reconcileCanvasNavigation, resourcePath, type CanvasFocus, type CanvasReadiness } from "@/features/canvas/model"
import { normalizeEmail } from "@/lib/identity"
import { getMutationError } from "@/lib/mutation-result"
import { canChangeTask } from "@/lib/task-permission"
import { toggleTask } from "@/app/tasks/actions"
import { archiveWorkspace, deleteWorkspace, transferWorkspaceOwnership } from "@/app/actions/workspaces"
import { ACCESS_CAPABILITIES } from "@/features/access/contracts"
import { permitsCapability } from "@/lib/capability-ceiling"
import { canvasUrl, parseCanvasUrl, resolveCanvasUrl, type CanvasLocation } from "@/features/canvas/navigation-url"
import { installHistoryPositions, subscribeHistoryTraversal, readHistoryPosition, historyTraversalDelta, publicHistoryState, type HistoryPosition } from "@/lib/browser-history"

const CanvasFlow = dynamic(() => import("./canvas-flow"), { ssr: false,
  loading: () => <p role="status" className="p-6">Loading canvas…</p> })
type Tool = "ready" | "tasks" | "prerequisites" | "team" | "settings" | "activity" | "agents"

export function CanvasShell({ email, actorId }: { email: string; actorId: string }) {
  const account = normalizeEmail(email)
  const scope = useMemo(() => ({ actorId, canvasId: "personal" }), [actorId])
  const store = useWorkspaces(email, { loadTasks: false })
  const workspace = store.workspaces.find(item => item.id === store.currentWorkspaceId)
  const [revision, setRevision] = useState(0)
  const graph = useCanvasGraph(actorId, workspace, store.realtime.eventRevision + revision)
  const companies = useCanvasResources(actorId, store.realtime.eventRevision + revision)
  const graphs = useMemo(() => graph.entry ? [graph.entry] : [], [graph.entry])
  const [navigation, setNavigation] = useState(() => createCanvasNavigation(scope))
  const currentNavigation = reconcileCanvasNavigation(navigation, scope, graphs, companies.resources)
  const [zoom, setZoom] = useState(1)
  const [workOpen, setWorkOpen] = useState(false)
  const [workMounted, setWorkMounted] = useState(false)
  const [tool, setTool] = useState<Tool>("ready")
  const [readyGroup, setReadyGroup] = useState<"ready" | "waiting" | "completed_inconsistent" | undefined>()
  const [tasksMounted, setTasksMounted] = useState(false)
  const [compactCanvas, setCompactCanvas] = useState(false)
  const reportCanvasWidth = useCallback((width: number) => setCompactCanvas(width < 640), [])
  const [listOpen, setListOpen] = useState(false)
  const [listReadiness, setListReadiness] = useState<CanvasReadiness | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createTarget, setCreateTarget] = useState<WorkspaceCreationTarget | null>(null)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyResourceId, setCompanyResourceId] = useState<string | null>(null)
  const [quickAdd, setQuickAdd] = useState(0)
  const [openTaskRequest, setOpenTaskRequest] = useState(0)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const writing = useRef(false)
  const dirty = useRef<{ tasks: boolean; settings: boolean; activeTasks?: boolean }>({ tasks: false, settings: false })
  const dirtyEditorTask = useRef<string | undefined>(undefined)
  const currentScope = useRef(workspace?.id)
  useLayoutEffect(() => { currentScope.current = workspace?.id }, [workspace?.id])
  const projection = useMemo(() => projectCanvas({ graphs, resources: companies.resources, navigation: currentNavigation, zoom, compact: compactCanvas }), [graphs, companies.resources, currentNavigation, zoom, compactCanvas])
  const tasks = graph.entry?.graph.tasks ?? []
  const taskReadiness = useMemo(() => new Map(projection.nodes.filter(node => node.kind === "task").map(node => [node.recordId, node.readiness])), [projection.nodes])
  const listedTasks = listReadiness ? tasks.filter(task => taskReadiness.get(task.id) === listReadiness) : tasks
  const readinessNames = { ready: "Ready", waiting: "Waiting", completed_inconsistent: "Review", completed: "Completed" }
  const focused = currentNavigation.focus
  const breadcrumbs = canvasBreadcrumbs(focused, companies.resources, store.workspaces, tasks)
  const locationButton = useRef<HTMLButtonElement | null>(null)
  const workTools = useRef<HTMLSelectElement | null>(null)
  const workFocusRequested = useRef(false)
  const [workFocusRevision, setWorkFocusRevision] = useState(0)
  const requestWorkFocus = () => { workFocusRequested.current = true; setWorkFocusRevision(value => value + 1) }
  const selectedTask = focused.kind === "task"
    ? tasks.find(task => task.id === focused.taskId) ?? null : null
  const isOwner = workspace ? account === normalizeEmail(workspace.ownerId) : false
  const capabilityCeiling = useMemo(() => Object.fromEntries(ACCESS_CAPABILITIES.map(capability => [capability, Boolean(workspace && permitsCapability(workspace.capabilityCeiling, capability))])), [workspace])
  const canComplete = Boolean(capabilityCeiling.edit && workspace && selectedTask && canChangeTask({ ownerId: normalizeEmail(workspace.ownerId),
    creatorId: normalizeEmail(selectedTask.createdBy), assigneeId: selectedTask.assigneeEmail ? normalizeEmail(selectedTask.assigneeEmail) : undefined }, account, "toggle"))
  const hasActiveDraft = useCallback(() => workOpen && ((tool === "tasks" && (dirty.current.activeTasks ?? dirty.current.tasks)) || (tool === "settings" && dirty.current.settings)), [workOpen, tool])
  const canLeave = useCallback(() => !hasActiveDraft() || window.confirm("Leave this work area? Your unfinished draft will be kept for recovery."), [hasActiveDraft])
  const canLeaveAll = useCallback(() => !Object.values(dirty.current).some(Boolean) || window.confirm("Leave this page or workspace? Unsaved changes may be lost if browser recovery is unavailable."), [])
  const stopFollowing = useCallback(() => setNavigation(state => state.followingAgent ? { ...state, followingAgent: false } : state), [setNavigation])
  const [pendingLocation, setPendingLocation] = useState<{ location: CanvasLocation | null } | null>(null)
  const browserNavigation = useRef<{ position: HistoryPosition; url: string; key: string; pending: boolean; expected: string | null; reverting: boolean } | null>(null)
  const location = useMemo<CanvasLocation>(() => ({ focus: focused, view: workOpen ? tool : null, group: workOpen && tool === "ready" ? readyGroup ?? null : null }), [focused, workOpen, tool, readyGroup])
  const locationKey = canvasUrl(location)
  const historyGuards = useRef({ canLeave, canLeaveAll, hasActiveDraft, workspaceId: store.currentWorkspaceId, focus: focused })
  useLayoutEffect(() => { historyGuards.current = { canLeave, canLeaveAll, hasActiveDraft, workspaceId: store.currentWorkspaceId, focus: focused } }, [canLeave, canLeaveAll, hasActiveDraft, store.currentWorkspaceId, focused])
  useEffect(() => {
    const url = () => window.location.pathname + window.location.search + window.location.hash
    installHistoryPositions(window)
    const state = { position: readHistoryPosition(window), url: url(), key: "", pending: true, expected: null as string | null, reverting: false }
    browserNavigation.current = state
    const initial = parseCanvasUrl(state.url)
    if (initial?.focus.kind === "overview") { state.pending = false; state.key = canvasUrl(initial) }
    else setPendingLocation({ location: initial })
    const pop = (event: PopStateEvent) => {
      if (state.reverting) { state.reverting = false; return }
      workFocusRequested.current = false
      const position = readHistoryPosition(window)
      const delta = historyTraversalDelta(state.position, position)
      const target = parseCanvasUrl(url())
      const guard = historyGuards.current
      const focus = target?.focus
      const changesPage = window.location.pathname !== new URL(state.url, window.location.origin).pathname
      const changesWorkspace = (focus?.kind === "workspace" || focus?.kind === "task") && focus.workspaceId !== guard.workspaceId
      const changesTask = focus?.kind === "task" && JSON.stringify(focus) !== JSON.stringify(guard.focus)
      const blockedEditor = focus?.kind === "task" && Boolean(dirtyEditorTask.current && dirtyEditorTask.current !== focus.taskId)
      const resumesEditor = focus?.kind === "task" && dirtyEditorTask.current === focus.taskId && !changesWorkspace
      const blockedActiveTask = changesTask && !resumesEditor && guard.hasActiveDraft()
      if (blockedEditor || blockedActiveTask) setMutationError("Save or discard the open draft before opening another task.")
      // Pre-instrumentation entries without a native index cannot be reversed safely.
      // Preserve their contents and allow the native traversal instead of erasing them.
      const canReverse = delta !== null && delta !== 0
      const allowed = !canReverse || (!writing.current && !blockedEditor && !blockedActiveTask && (resumesEditor || (changesPage || changesWorkspace ? guard.canLeaveAll() : guard.canLeave())))
      if (!allowed) {
        event.stopImmediatePropagation()
        state.reverting = true
        window.history.go(delta!)
        return
      }
      if (changesPage) { state.pending = true; return }
      state.position = position
      state.url = url(); state.pending = true
      setNavigation(previous => previous.followingAgent ? { ...previous, followingAgent: false } : previous)
      setPendingLocation({ location: target })
    }
    const unsubscribe = subscribeHistoryTraversal(window, pop)
    return () => { unsubscribe(); browserNavigation.current = null }
  }, [actorId])
  useEffect(() => {
    const state = browserNavigation.current
    if (!state || !pendingLocation) return
    const target = pendingLocation.location
    const resolution = target ? resolveCanvasUrl(target, {
      loading: store.loading || companies.loading, error: Boolean(store.workspaceError || companies.error),
      workspaceIds: store.workspaces.filter(item => permitsCapability(item.capabilityCeiling, "read")).map(item => item.id),
      resourceIds: companies.resources.map(item => item.id), currentWorkspaceId: store.currentWorkspaceId,
      graphWorkspaceId: graph.entry?.workspace.id ?? null, graphLoading: graph.loading, graphError: Boolean(graph.error), taskIds: tasks.map(item => item.id),
    }) : { kind: "unavailable" as const }
    if (resolution.kind === "wait") return
    if (resolution.kind === "select") {
      dirty.current = { tasks: false, settings: false }; dirtyEditorTask.current = undefined
      setQuickAdd(0); setTasksMounted(false); setWorkOpen(false); setWorkMounted(false)
      store.setCurrentWorkspaceId(resolution.workspaceId)
      return
    }
    const restored: CanvasLocation = resolution.kind === "ready" && target ? { ...target } : { focus: { kind: "overview" }, view: null, group: null }
    if ((restored.view === "settings" && (!isOwner || !capabilityCeiling.manage)) || (restored.view === "prerequisites" && !capabilityCeiling.edit)) restored.view = "ready"
    if (resolution.kind === "unavailable") setMutationError("This canvas location is unavailable. Choose another location.")
    setNavigation(previous => navigateCanvas(previous.scope.actorId === actorId ? previous : createCanvasNavigation(scope), restored.focus, "manual"))
    setListOpen(false); setWorkOpen(Boolean(restored.view))
    if (restored.view) { setTool(restored.view); setWorkMounted(true) }
    setReadyGroup(restored.group ?? undefined)
    if (restored.view === "tasks") { setTasksMounted(true); if (restored.focus.kind === "task") setOpenTaskRequest(value => value + 1) }
    state.expected = canvasUrl(restored); state.key = state.expected; state.pending = false
    state.url = canvasUrl(restored, state.url)
    window.history.replaceState(publicHistoryState(window.history.state), "", state.url)
    state.position = readHistoryPosition(window)
    setPendingLocation(null)
  }, [pendingLocation, store, companies.loading, companies.error, companies.resources, graph.entry, graph.loading, graph.error, tasks, actorId, scope, isOwner, capabilityCeiling])
  useEffect(() => {
    const state = browserNavigation.current
    if (!state || state.pending || state.reverting) return
    if (store.loading || companies.loading || store.workspaceError || companies.error) return
    const intent = navigation.focus
    if ((intent.kind === "workspace" || intent.kind === "task") && store.workspaces.some(item => item.id === intent.workspaceId && permitsCapability(item.capabilityCeiling, "read")) && !graph.error && (graph.loading || graph.entry?.workspace.id !== intent.workspaceId)) return
    if (state.expected && state.expected !== locationKey) return
    state.expected = null
    if (state.key === locationKey) return
    // Reconciliation and agent following replace history; camera changes never enter it.
    const replace = navigation.followingAgent || canvasUrl({ focus: navigation.focus, view: workOpen ? tool : null, group: workOpen && tool === "ready" ? readyGroup ?? null : null }) !== locationKey
    state.url = canvasUrl(location, state.url); state.key = locationKey
    window.history[replace ? "replaceState" : "pushState"](publicHistoryState(window.history.state), "", state.url)
    state.position = readHistoryPosition(window)
  }, [location, locationKey, navigation, actorId, workOpen, tool, readyGroup, store.loading, store.workspaceError, store.workspaces, companies.loading, companies.error, graph.loading, graph.error, graph.entry])
  const dismissPendingLocation = useCallback(() => {
    const state = browserNavigation.current
    if (state) { state.pending = false; state.expected = null }
    setPendingLocation(null)
  }, [])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (Object.values(dirty.current).some(Boolean)) { event.preventDefault(); event.returnValue = "" } }
    window.addEventListener("beforeunload", beforeUnload)
    return () => window.removeEventListener("beforeunload", beforeUnload)
  }, [])
  useEffect(() => {
    const accountChanged = (event: StorageEvent) => { if (event.key === "auth-change") window.location.reload() }
    window.addEventListener("storage", accountChanged)
    return () => window.removeEventListener("storage", accountChanged)
  }, [])
  const open = useCallback((focus: CanvasFocus) => {
    const resumesEditor = focus.kind === "task" && dirtyEditorTask.current === focus.taskId && focus.workspaceId === store.currentWorkspaceId
    if (focus.kind === "task" && !resumesEditor && (dirtyEditorTask.current || hasActiveDraft())) {
      setMutationError("Save or discard the open draft before opening another task.")
      return
    }
    const changesWorkspace = (focus.kind === "workspace" || focus.kind === "task") && focus.workspaceId !== store.currentWorkspaceId
    if (!resumesEditor && !(changesWorkspace ? canLeaveAll() : canLeave())) return
    dismissPendingLocation()
    workFocusRequested.current = false
    if (changesWorkspace && (focus.kind === "workspace" || focus.kind === "task")) {
      dirty.current = { tasks: false, settings: false }; dirtyEditorTask.current = undefined
      setQuickAdd(0); setTasksMounted(false)
      store.setCurrentWorkspaceId(focus.workspaceId)
    }
    setNavigation(state => navigateCanvas(state, focus, "manual"))
    if (focus.kind === "task") { setOpenTaskRequest(value => value + 1); setWorkOpen(true); setWorkMounted(true); setTasksMounted(true); setTool("tasks") }
    else setWorkOpen(false)
    return true
  }, [canLeave, canLeaveAll, hasActiveDraft, dismissPendingLocation, setNavigation, setWorkOpen, setWorkMounted, setTool, setMutationError, setQuickAdd, setOpenTaskRequest, setTasksMounted, store])
  const openTask = (id: string, workspaceId = workspace?.id) => { if (workspaceId && store.workspaces.some(item => item.id === workspaceId)) return open({ kind: "task", workspaceId, taskId: id }) }
  const openWorkspace = () => { if (workspace && (focused.kind === "workspace" || focused.kind === "task") && focused.workspaceId === workspace.id && open({ kind: "workspace", workspaceId: workspace.id })) { setReadyGroup(undefined); setTool("ready"); setWorkOpen(true); setWorkMounted(true); requestWorkFocus() } }
  const followTask = (taskId: string) => {
    if (!workspace || !tasks.some(task => task.id === taskId && task.workspaceId === workspace.id)) {
      void graph.reload()
      setMutationError("Refreshing the task. Choose Follow agent again after the workspace is current.")
      return
    }
    setMutationError(null)
    setNavigation(state => navigateCanvas(state, { kind: "task", workspaceId: workspace.id, taskId }, "agent"))
  }
  const changeTool = (next: Tool) => { if (canLeave()) { dismissPendingLocation(); stopFollowing(); if (next === "tasks") setTasksMounted(true); if (next === "ready") setReadyGroup(undefined); setTool(next) } }
  const changeWorkspace = (id: string) => {
    if (!canLeaveAll() || writing.current) return
    dismissPendingLocation()
    dirty.current = { tasks: false, settings: false }; dirtyEditorTask.current = undefined
    setWorkOpen(false); setWorkMounted(false); setTasksMounted(false); setListOpen(false); setMutationError(null); setQuickAdd(0)
    setNavigation(navigateCanvas(createCanvasNavigation(scope), { kind: "workspace", workspaceId: id }, "manual"))
    store.setCurrentWorkspaceId(id)
  }
  const beginCreateWorkspace = () => {
    if (!canLeaveAll()) return
    try {
      const raw = sessionStorage.getItem(`saathi:canvas-workspace-create:${encodeURIComponent(actorId)}`)
      const saved = raw ? JSON.parse(raw) : null
      if (saved?.command?.operation === "workspace.create" && typeof saved.path === "string" && typeof saved.command.input?.parentId === "string" && Number.isInteger(saved.command.input.expectedParentVersion)) {
        setCreateTarget({ id: saved.command.input.parentId, version: saved.command.input.expectedParentVersion, path: saved.path }); setCreateOpen(true); return
      }
    } catch { /* The contextual form reports unavailable recovery before dispatch. */ }
    const creationFocus = currentNavigation.focus
    const focusedResource = creationFocus.kind === "resource"
      ? companies.resources.find(row => row.id === creationFocus.resourceId)
      : creationFocus.kind === "workspace" || creationFocus.kind === "task"
        ? companies.resources.find(row => row.workspaceId === creationFocus.workspaceId) : undefined
    const target = focusedResource?.kind === "workspace"
      ? companies.resources.find(row => row.id === focusedResource.parentId) : focusedResource
    if (target && ["space", "section"].includes(target.kind)) {
      if (!target.capabilities.includes("manage") || !target.capabilities.includes("create")) { setMutationError("You need create and manage access to add a workspace here."); return }
      setCreateTarget({ id: target.id, version: target.version, path: resourcePath(target.id, companies.resources).map(row => row.name).join(" / ") })
    } else setCreateTarget(null)
    setCreateOpen(true)
  }
  const createTask = () => {
    if (!workspace || !capabilityCeiling.create || !canLeave()) return
    dismissPendingLocation()
    workFocusRequested.current = false
    setNavigation(state => navigateCanvas(state, { kind: "workspace", workspaceId: workspace.id }, "manual"))
    setTool("tasks"); setTasksMounted(true); setWorkOpen(true); setWorkMounted(true); setQuickAdd(value => value + 1)
  }
  const complete = async () => {
    if (!workspace || !selectedTask || !canComplete || writing.current || graph.loading || selectedTask.completed || selectedTask.status === "done") return
    writing.current = true; setSaving(true); setMutationError(null)
    const workspaceId = workspace.id
    try {
      const result = await toggleTask(selectedTask.id, selectedTask.version ?? selectedTask.updatedAt)
      if (currentScope.current !== workspaceId) return
      const error = getMutationError(result)
      if (error) setMutationError(error)
      const refreshed = await graph.reload()
      if (!refreshed && !error) setMutationError("Task completed. Refresh the workspace to see its current state.")
      setRevision(value => value + 1)
    } catch {
      if (currentScope.current === workspaceId) { setMutationError("Unable to confirm completion. Refresh the workspace before retrying."); await graph.reload() }
    } finally { writing.current = false; setSaving(false) }
  }
  const draftScope = workspace ? `saathi:draft:${encodeURIComponent(account)}:${workspace.id}` : undefined
  const refreshAll = async () => { await Promise.all([store.refreshWorkspaces(), companies.reload()]); setRevision(value => value + 1) }
  const accessDenied = Boolean(workspace && !capabilityCeiling.read)
  const workspaceUnavailable = Boolean(store.workspaceError || companies.error || graph.error || accessDenied)
  const broadSearch = focused.kind === "overview" || focused.kind === "resource"
  const commandDisabled = store.loading || companies.loading || Boolean(store.workspaceError || companies.error) || (!broadSearch && (!workspace || !graph.entry || graph.loading || workspaceUnavailable || !capabilityCeiling.read))
  const showWorkArea = workOpen && Boolean(graph.entry && capabilityCeiling.read)
  useLayoutEffect(() => {
    if (workFocusRequested.current && showWorkArea && workTools.current) {
      workFocusRequested.current = false
      workTools.current.focus()
    }
  }, [workFocusRevision, showWorkArea])
  const dockClearance = navigation.followingAgent
    ? "bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+8.25rem)] sm:bottom-32"
    : "bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] sm:bottom-32"
  return <main className="saathi-dashboard relative h-dvh overflow-hidden bg-background text-foreground">
    <header onPointerDownCapture={stopFollowing} className="absolute inset-x-0 top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-card/95 px-3 sm:px-5">
      <h1 className="sr-only">Canvas</h1>
      <nav aria-label="Canvas hierarchy" className="flex min-w-0 flex-1 items-center gap-2">
        <Button size="sm" variant="ghost" className="size-11 shrink-0 px-0 sm:w-auto sm:px-3" aria-label="Back" title="Back" disabled={focused.kind === "overview"} onClick={() => open(parentCanvasFocus(focused, companies.resources))}><ArrowLeft className="size-4" /><span className="hidden sm:inline">Back</span></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button ref={locationButton} variant="ghost" className="h-11 min-w-0 flex-1 justify-between gap-2 px-2 text-base font-semibold sm:flex-initial sm:max-w-xl" aria-label={"Canvas location: " + (breadcrumbs.at(-1)?.label ?? "Canvas")} aria-current="location" data-workspace-id={workspace?.id} title={breadcrumbs.map(item => item.label).join(" / ")}><span className="truncate">{breadcrumbs.at(-1)?.label ?? "Canvas"}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" aria-labelledby={undefined} aria-label="Canvas locations" className="w-[min(28rem,calc(100vw-1.5rem))]">
            {breadcrumbs.map((item, index) => <DropdownMenuItem key={JSON.stringify(item.focus)} data-canvas-label={item.label} data-canvas-focus={JSON.stringify(item.focus)} aria-current={index === breadcrumbs.length - 1 ? "location" : undefined} className="block min-h-11 whitespace-normal break-words py-3" onSelect={() => { open(item.focus) }}>{breadcrumbs.slice(0, index + 1).map(ancestor => ancestor.label).join(" / ")}</DropdownMenuItem>)}
            {store.workspaces.length > 0 && <DropdownMenuSeparator />}
            {store.workspaces.map(item => <DropdownMenuItem key={item.id} data-workspace-id={item.id} className="block min-h-11 whitespace-normal break-words py-3" disabled={saving} onSelect={() => changeWorkspace(item.id)}>{item.name}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      {showWorkArea && <Button variant="outline" size="sm" className="h-11 shrink-0 px-3" aria-label="Show canvas" title="Show canvas" onClick={() => { if (canLeave()) { stopFollowing(); setWorkOpen(false); locationButton.current?.focus() } }}><MapIcon className="size-4" /><span>Canvas</span></Button>}
      <Button size="sm" variant="outline" className={"h-11 shrink-0 px-3 disabled:opacity-100 " + (broadSearch || showWorkArea ? "hidden" : "")} aria-label="Open workspace tools" disabled={commandDisabled || broadSearch} onClick={openWorkspace}><List className="size-4" /><span>Work</span></Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Canvas menu"><MoreHorizontal className="size-5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-labelledby={undefined} aria-label="Canvas menu">
          <DropdownMenuItem className="min-h-11" disabled={store.loading || saving} onSelect={() => { void refreshAll() }}><RefreshCw className="size-4" />Refresh canvas</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" aria-label="Manage canvas" onSelect={() => { if (canLeave()) { setCompanyResourceId(null); setCompanyOpen(true) } }}><Building2 className="size-4" />Manage canvas</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" aria-label="Create workspace" onSelect={beginCreateWorkspace}><Plus className="size-4" />Create workspace</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="min-h-11"><Link href="/dashboard" aria-label="Open dashboard" onClick={event => { if (!canLeaveAll()) event.preventDefault() }}><ArrowLeft className="size-4" />Dashboard</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    <div className={`absolute inset-x-0 top-16 ${dockClearance}`}>
      {store.loading ? <p role="status" className="p-6">Loading workspaces…</p>
        : store.workspaceError ? <div role="alert" className="m-6 space-y-3"><p>{store.workspaceError}</p><Button onClick={() => void store.refreshWorkspaces()}>Try again</Button></div>
        : companies.loading ? <p role="status" className="p-6">Loading companies…</p>
        : companies.error ? <div role="alert" className="m-6 space-y-3"><p>{companies.error}</p><Button onClick={() => void refreshAll()}>Try again</Button></div>
        : !workspace && store.workspaces.length === 0 && companies.resources.length === 0 ? <div className="grid h-full place-items-center"><div className="space-y-4 text-center"><h2 className="text-2xl font-semibold">Create a workspace</h2><Button onClick={beginCreateWorkspace}>Create workspace</Button></div></div>
        : graph.error || accessDenied ? <div role="alert" className="m-6 space-y-3"><p>{graph.error ?? "Workspace unavailable or access denied"}</p><Button onClick={() => void refreshAll()}>Try again</Button></div>
        : <><div role="region" aria-label="Workspace canvas" className={`relative ${showWorkArea ? "invisible pointer-events-none h-full lg:visible lg:pointer-events-auto lg:w-[48%]" : "h-full"}`}><ReactFlowProvider key={`${actorId}:${scope.canvasId}`}><CanvasFlow projection={projection} cameraKey={cameraStorageKey(scope)} onOpen={open} ready={!graph.loading && !companies.loading && !companies.error}
          resources={companies.resources} references={companies.references} workspaces={store.workspaces} focus={currentNavigation.focus} followingAgent={navigation.followingAgent} onOpenResource={id => open({ kind: "resource", resourceId: id })}
          onViewportWidthChange={reportCanvasWidth}
          onZoom={value => setZoom(previous => (previous < 0.55) === (value < 0.55) ? previous : value)}
          onOpenGroup={(workspaceId, readiness) => { if (workspaceId !== workspace?.id || graph.loading || !capabilityCeiling.read || !open({ kind: "workspace", workspaceId })) return; stopFollowing(); if (readiness === "completed") { setListReadiness(readiness); setListOpen(true) } else { setReadyGroup(readiness); setTool("ready"); setWorkOpen(true); setWorkMounted(true); requestWorkFocus() } }}
          onManualNavigation={stopFollowing} /></ReactFlowProvider></div>

          {graph.loading && <p role="status" className="absolute bottom-2 left-4 rounded bg-card px-3 py-1 text-sm">Refreshing…</p>}

        </>}
      {workspace && graph.entry && capabilityCeiling.read && !workspaceUnavailable && workMounted && <aside aria-label="Workspace work area" className={`saathi-mobile-controls ${workOpen ? "" : "hidden"} absolute bottom-0 top-0 right-0 z-10 w-full overflow-y-auto border-t border-border bg-background lg:top-0 lg:w-[52%] lg:border-l lg:border-t-0`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
          <h2 className="sr-only sm:not-sr-only sm:min-w-0 sm:truncate sm:font-semibold">{selectedTask?.title ?? workspace.name}</h2>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <select ref={workTools} aria-label="Workspace tools" value={tool} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm" onChange={event => changeTool(event.target.value as Tool)}>
              <option value="ready">Ready and Waiting</option><option value="tasks">Task board</option>
              {capabilityCeiling.edit && <option value="prerequisites">Prerequisites</option>}
              <option value="agents">Agent runs</option><option value="team">Team</option><option value="activity">History</option>
              {isOwner && capabilityCeiling.manage && <option value="settings">Settings</option>}
            </select>

          </div>
        </div>
        {tool === "ready" && <div className="p-4"><NextWorkView compact focusGroup={readyGroup} onShowAll={() => setReadyGroup(undefined)} workspace={workspace} currentUserEmail={email} refreshSignal={store.realtime.eventRevision + revision} connected={store.realtime.isConnected} onOpenTask={openTask} onChanged={graph.reload} /></div>}
        {tasksMounted && <div hidden={tool !== "tasks"}><WorkspaceBoard compactToolbar key={workspace.id} workspace={workspace} currentUserEmail={email}
          refreshSignal={store.realtime.eventRevision + revision} openTaskRequest={openTaskRequest} openTaskId={tool === "tasks" ? selectedTask?.id ?? null : null} commentRefreshEvent={store.realtime.lastEvent} capabilityCeiling={capabilityCeiling}
          focusQuickAdd={quickAdd} draftScope={draftScope} onChanged={graph.reload} onOpenTask={openTask} active={workOpen && tool === "tasks"} onDirtyChange={(value, active = value, editorDraftTaskId) => { dirty.current.tasks = value; dirty.current.activeTasks = active; dirtyEditorTask.current = editorDraftTaskId }}
          onAddTask={async (...args) => { const result = await store.addTask(...args); if (!getMutationError(result)) setRevision(value => value + 1); return result }} /></div>}
        {tool === "prerequisites" && capabilityCeiling.edit && <div className="p-4"><NextWorkView workspace={workspace} currentUserEmail={email} refreshSignal={store.realtime.eventRevision + revision} connected={store.realtime.isConnected} onOpenTask={openTask} onChanged={graph.reload} /></div>}
        {tool === "team" && <div className="p-4">{capabilityCeiling.manage ? <MemberManager workspaceId={workspace.id} members={workspace.members} currentUserEmail={email} workspaceOwnerId={workspace.ownerId} onAddMember={store.addMember} onRemoveMember={store.removeMember} onTransferOwnership={async id => { await transferWorkspaceOwnership(workspace.id, id, workspace.version); await refreshAll() }} />
          : <ul className="space-y-3">{workspace.members.map(member => <li key={member.userId} className="rounded-lg border border-border p-3"><p className="font-medium">{member.username || member.email}</p></li>)}</ul>}</div>}
        {tool === "settings" && isOwner && capabilityCeiling.manage && <div className="p-4"><WorkspaceSettings workspace={workspace} draftScope={draftScope} onDirtyChange={value => { dirty.current.settings = value }} onSaved={refreshAll}
          onArchived={capabilityCeiling.manage ? async () => { await archiveWorkspace(workspace.id, workspace.version); await refreshAll() } : undefined}
          onDeleted={capabilityCeiling.delete ? async () => { await deleteWorkspace(workspace.id); await refreshAll() } : undefined} /></div>}
        {tool === "activity" && <div className="p-4"><ActivityHistory workspaceId={workspace.id} refreshSignal={store.realtime.eventRevision} /></div>}
        {tool === "agents" && <div className="p-4"><AgentActivity workspaceId={workspace.id} actorId={actorId} draftScope={draftScope} canReview={capabilityCeiling.edit} refreshSignal={store.realtime.eventRevision + revision}
          onFollowTask={followTask} onFollowingEnded={stopFollowing} followingTaskId={navigation.followingAgent && navigation.focus.kind === "task" ? navigation.focus.taskId : null} /></div>}
      </aside>}
    </div>
    {mutationError && <p role="alert" className={`absolute inset-x-4 z-30 mx-auto max-w-3xl rounded-lg border border-destructive/30 bg-card p-3 text-sm ${dockClearance}`}>{mutationError}</p>}
    <CanvasCommandBar key={`${account}:${workspace?.id ?? "none"}`} scopeName={breadcrumbs.map(item => item.label).join(" / ")} scopeLabel={breadcrumbs.at(-1)?.label ?? "Canvas"}
      searchScope={broadSearch ? focused.kind === "resource" ? { resourceId: focused.resourceId } : {} : undefined} searchRevision={JSON.stringify([actorId, store.realtime.eventRevision, revision, companies.resources, store.workspaces.map(item => item.id)])}
      tasks={tasks} selectedTask={selectedTask} canComplete={canComplete} canCreate={!broadSearch && (capabilityCeiling.create ?? false)} busy={saving} disabled={commandDisabled} onOpenTask={openTask} onCreate={createTask} onComplete={() => void complete()} onWorkspace={openWorkspace} onList={() => { stopFollowing(); setListReadiness(null); setListOpen(true) }} followingAgent={navigation.followingAgent} onStopFollowing={stopFollowing} />
    <Dialog open={listOpen} onOpenChange={setListOpen}><DialogContent className="saathi-mobile-controls max-h-[80dvh] overflow-y-auto"><DialogHeader><DialogTitle>{listReadiness ? readinessNames[listReadiness] : workspace?.name ?? "Workspace"} tasks</DialogTitle><DialogDescription className="sr-only">Open a task from the current authorized workspace.</DialogDescription></DialogHeader>
      {graph.error ? <p role="alert">{graph.error}</p> : graph.loading && !graph.entry ? <p role="status">Loading tasks…</p> : <ul className="space-y-2">{listedTasks.map(task => <li key={task.id}><Button variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => { openTask(task.id); setListOpen(false) }}>{task.title}<span className="ml-auto pl-3 text-xs text-muted-foreground">{taskReadiness.get(task.id)?.replaceAll("_", " ")}</span></Button></li>)}</ul>}
      {!graph.loading && !graph.error && listedTasks.length === 0 && <p>{listReadiness ? "No tasks in this group." : "No tasks in this workspace."}</p>}
    </DialogContent></Dialog>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="saathi-mobile-controls max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Create workspace</DialogTitle><DialogDescription className="sr-only">Create a workspace using its name, goal and target date.</DialogDescription></DialogHeader>{createTarget ? <ContextualWorkspaceCreate actorId={actorId} target={createTarget} onCancel={() => setCreateOpen(false)} onCreated={async id => { const refreshed = await Promise.all([store.refreshWorkspaces(), companies.reload()]); setRevision(value => value + 1); if (!refreshed.every(Boolean)) throw new Error("Canvas refresh incomplete"); dirty.current = { tasks: false, settings: false }; dirtyEditorTask.current = undefined; setQuickAdd(0); setTasksMounted(false); store.setCurrentWorkspaceId(id); setNavigation(state => navigateCanvas(state, { kind: "workspace", workspaceId: id }, "manual")); setCreateOpen(false); setWorkOpen(false); setWorkMounted(false) }} /> : <WorkspaceCreateForm compact aiEnabled={false} canCancel onCancel={() => setCreateOpen(false)}
      onCreate={async (name, details) => { await store.createWorkspace(name, details); setCreateOpen(false); setNavigation(createCanvasNavigation(scope)); setWorkOpen(false); setWorkMounted(false) }}
      onSuggest={async () => ({ error: "Planning assistance is unavailable here." })} onApprove={async () => ({ error: "Use manual workspace creation." })} />}</DialogContent></Dialog>
    <Dialog open={companyOpen} onOpenChange={setCompanyOpen}><DialogContent className="saathi-mobile-controls max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Company canvas</DialogTitle><DialogDescription className="sr-only">Manage companies, sections and their explicit access grants.</DialogDescription></DialogHeader>
      {companies.error ? <div role="alert" className="space-y-3"><p>{companies.error}</p><Button onClick={() => void companies.reload()}>Try again</Button></div> : companies.loading ? <p role="status">Loading companies…</p>
        : <CompanyPanel key={actorId} actorId={actorId} resources={companies.resources} workspace={workspace} initialResourceId={companyResourceId} refreshSignal={store.realtime.eventRevision + revision} onChanged={refreshAll}
          onWorkspace={id => { setCompanyOpen(false); changeWorkspace(id) }} onInvite={id => { if (store.workspaces.some(item => item.id === id) && (id === workspace?.id ? canLeave() : canLeaveAll())) { if (workspace?.id !== id) { dirty.current = { tasks: false, settings: false }; dirtyEditorTask.current = undefined; setQuickAdd(0); store.setCurrentWorkspaceId(id) } setNavigation(state => navigateCanvas(state, { kind: "workspace", workspaceId: id }, "manual")); setCompanyOpen(false); setTool("team"); setWorkMounted(true); setWorkOpen(true) } }} />}
    </DialogContent></Dialog>
  </main>
}
