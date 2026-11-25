"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { readCanvasView, saveCanvasView } from "@/features/canvas/view-state"
import { generateWorkspaceDraft, createWorkspaceFromPlan } from "@/app/actions/workspace-intent"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { ArrowLeft, Building2, ChevronDown, Columns3, List, Map as MapIcon, MoreHorizontal, Plus, RefreshCw } from "lucide-react"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useCanvasGraph } from "@/hooks/use-canvas-graph"
import { WorkspaceBoard } from "@/components/workspace-board"
import { WorkspaceCreateForm } from "@/components/workspace-create-form"
import { CanvasTaskPanel } from "./canvas-task-panel"
import { WorkBoard } from "./work-board"
import { InvitationNotifications } from "@/components/invitation-notifications"
import { logout } from "@/lib/auth-simple"
import { clearAccountDrafts } from "@/lib/draft-storage"
import { MemberManager } from "@/components/member-manager"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { ThemeMenuItems } from "@/components/theme-menu-items"
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
type Tool = "work" | "ready" | "tasks" | "prerequisites" | "team" | "settings" | "activity" | "agents"

export function CanvasShell({ email, actorId, aiEnabled = false }: { email: string; actorId: string; aiEnabled?: boolean }) {
  const router = useRouter()
  const [invitationsOpen, setInvitationsOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
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
  const [tool, setTool] = useState<Tool>("work")
  // People read lanes; the graph is one switch away. The choice sticks per browser.
  const [layout, setLayout] = useState<"board" | "map">("board")
  useLayoutEffect(() => { try { if (window.localStorage.getItem("saathi:layout") === "map") setLayout("map") } catch { /* Storage can be unavailable. */ } }, [])
  const chooseLayout = (next: "board" | "map") => { setLayout(next); try { window.localStorage.setItem("saathi:layout", next) } catch { /* Storage can be unavailable. */ } }
  const [readyGroup, setReadyGroup] = useState<CanvasReadiness | undefined>()
  const [tasksMounted, setTasksMounted] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [compactCanvas, setCompactCanvas] = useState(false)
  const [fitWorkspaceId, setFitWorkspaceId] = useState<string>()
  const reportCanvasWidth = useCallback((width: number) => setCompactCanvas(width < 640), [])
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
  const projection = useMemo(() => projectCanvas({ graphs, resources: companies.resources, navigation: currentNavigation, zoom, compact: compactCanvas, fitWorkspaceId, relationships: true }), [graphs, companies.resources, currentNavigation, zoom, compactCanvas, fitWorkspaceId])
  const tasks = useMemo(() => graph.entry?.graph.tasks ?? [], [graph.entry])
  const focused = currentNavigation.focus
  const fittedWorkspace = compactCanvas && focused.kind === "workspace" && fitWorkspaceId === focused.workspaceId
  const breadcrumbs = canvasBreadcrumbs(focused, companies.resources, store.workspaces, tasks)
  const locationButton = useRef<HTMLButtonElement | null>(null)
  const workTools = useRef<HTMLSelectElement | null>(null)
  const taskSummaryBack = useRef<HTMLButtonElement | null>(null)
  const workFocusRequested = useRef(false)
  const [workFocusRevision, setWorkFocusRevision] = useState(0)
  const requestWorkFocus = () => { workFocusRequested.current = true; setWorkFocusRevision(value => value + 1) }
  const selectedTask = focused.kind === "task"
    ? tasks.find(task => task.id === focused.taskId) ?? null : null
  const isOwner = workspace ? account === normalizeEmail(workspace.ownerId) : false
  const capabilityCeiling = useMemo(() => Object.fromEntries(ACCESS_CAPABILITIES.map(capability => [capability, Boolean(workspace && permitsCapability(workspace.capabilityCeiling, capability))])), [workspace])
  const canComplete = Boolean(capabilityCeiling.edit && workspace && selectedTask && canChangeTask({ ownerId: normalizeEmail(workspace.ownerId),
    creatorId: normalizeEmail(selectedTask.createdBy), assigneeId: selectedTask.assigneeEmail ? normalizeEmail(selectedTask.assigneeEmail) : undefined }, account, "toggle"))
  const canEditSelected = Boolean(capabilityCeiling.edit && workspace && selectedTask && canChangeTask({ ownerId: normalizeEmail(workspace.ownerId), creatorId: normalizeEmail(selectedTask.createdBy), assigneeId: selectedTask.assigneeEmail ? normalizeEmail(selectedTask.assigneeEmail) : undefined }, account, "edit"))
  const hasActiveDraft = useCallback(() => workOpen && ((tool === "tasks" && (dirty.current.activeTasks ?? dirty.current.tasks)) || (tool === "settings" && dirty.current.settings)), [workOpen, tool])
  const canLeave = useCallback(() => !hasActiveDraft() || window.confirm("Leave this work area? Your unfinished draft will be kept for recovery."), [hasActiveDraft])
  const canLeaveAll = useCallback(() => !Object.values(dirty.current).some(Boolean) || window.confirm("Leave this page or workspace? Unsaved changes may be lost if browser recovery is unavailable."), [])
  const stopFollowing = useCallback(() => setNavigation(state => state.followingAgent ? { ...state, followingAgent: false } : state), [setNavigation])
  const [locationInitialized, setLocationInitialized] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ location: CanvasLocation | null } | null>(null)
  const browserNavigation = useRef<{ position: HistoryPosition; url: string; key: string; pending: boolean; expected: string | null; reverting: boolean } | null>(null)
  const location = useMemo<CanvasLocation>(() => ({ focus: focused, view: workOpen ? tool : null, group: workOpen && (tool === "ready" || tool === "work") ? readyGroup ?? null : null }), [focused, workOpen, tool, readyGroup])
  const locationKey = canvasUrl(location)
  const historyGuards = useRef({ canLeave, canLeaveAll, hasActiveDraft, workspaceId: store.currentWorkspaceId, focus: focused })
  useLayoutEffect(() => { historyGuards.current = { canLeave, canLeaveAll, hasActiveDraft, workspaceId: store.currentWorkspaceId, focus: focused } }, [canLeave, canLeaveAll, hasActiveDraft, store.currentWorkspaceId, focused])
  useEffect(() => {
    const url = () => window.location.pathname + window.location.search + window.location.hash
    installHistoryPositions(window)
    const state = { position: readHistoryPosition(window), url: url(), key: "", pending: true, expected: null as string | null, reverting: false }
    browserNavigation.current = state
    const requested = parseCanvasUrl(state.url)
    const initial = requested?.focus.kind === "overview" ? { ...requested, focus: readCanvasView(scope).focus } : requested
    if (initial?.focus.kind === "overview") { state.pending = false; state.key = canvasUrl(initial); setLocationInitialized(true) }
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
  }, [actorId, scope])
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
    setWorkOpen(Boolean(restored.view))
    if (restored.view) { setTool(restored.view); setWorkMounted(true) }
    setReadyGroup(restored.group ?? undefined)
    if (restored.view === "tasks") { setTasksMounted(true); if (restored.focus.kind === "task") setOpenTaskRequest(value => value + 1) }
    state.expected = canvasUrl(restored); state.key = state.expected; state.pending = false
    state.url = canvasUrl(restored, state.url)
    window.history.replaceState(publicHistoryState(window.history.state), "", state.url)
    state.position = readHistoryPosition(window)
    setPendingLocation(null); setLocationInitialized(true)
  }, [pendingLocation, store, store.loading, store.workspaceError, store.workspaces, store.currentWorkspaceId, companies.loading, companies.error, companies.resources, graph.entry, graph.loading, graph.error, tasks, actorId, scope, isOwner, capabilityCeiling])
  useEffect(() => {
    const state = browserNavigation.current
    if (!state || state.pending || state.reverting) return
    if (store.loading || companies.loading || store.workspaceError || companies.error) return
    const intent = navigation.focus
    if ((intent.kind === "workspace" || intent.kind === "task") && store.workspaces.some(item => item.id === intent.workspaceId && permitsCapability(item.capabilityCeiling, "read")) && !graph.error && (graph.loading || graph.entry?.workspace.id !== intent.workspaceId)) return
    if (state.expected && state.expected !== locationKey) return
    state.expected = null
    saveCanvasView(scope, currentNavigation.focus)
    if (state.key === locationKey) return
    // Reconciliation and agent following replace history; camera changes never enter it.
    const replace = navigation.followingAgent || canvasUrl({ focus: navigation.focus, view: workOpen ? tool : null, group: workOpen && (tool === "ready" || tool === "work") ? readyGroup ?? null : null }) !== locationKey
    state.url = canvasUrl(location, state.url); state.key = locationKey
    window.history[replace ? "replaceState" : "pushState"](publicHistoryState(window.history.state), "", state.url)
    state.position = readHistoryPosition(window)
  }, [scope, currentNavigation.focus, location, locationKey, navigation, actorId, workOpen, tool, readyGroup, store.loading, store.workspaceError, store.workspaces, companies.loading, companies.error, graph.loading, graph.error, graph.entry])
  const dismissPendingLocation = useCallback(() => {
    const state = browserNavigation.current
    if (state) { state.pending = false; state.expected = null }
    setPendingLocation(null); setLocationInitialized(true)
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
  const open = useCallback((focus: CanvasFocus, edit = false) => {
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
    if (focus.kind === "task" || focus.kind === "workspace") {
      if (edit) { setOpenTaskRequest(value => value + 1); setTasksMounted(true) }
      setWorkOpen(true); setWorkMounted(true); setTool(edit ? "tasks" : "work")
    } else setWorkOpen(false)
    return true
  }, [canLeave, canLeaveAll, hasActiveDraft, dismissPendingLocation, setNavigation, setWorkOpen, setWorkMounted, setTool, setMutationError, setQuickAdd, setOpenTaskRequest, setTasksMounted, store])
  const inspectTask = (id: string, workspaceId = workspace?.id) => { if (workspaceId && store.workspaces.some(item => item.id === workspaceId)) return open({ kind: "task", workspaceId, taskId: id }) }
  const openTask = (id: string, workspaceId = workspace?.id) => { if (workspaceId && store.workspaces.some(item => item.id === workspaceId)) return open({ kind: "task", workspaceId, taskId: id }, true) }
  const openWorkspace = () => { if (workspace && (focused.kind === "workspace" || focused.kind === "task") && focused.workspaceId === workspace.id && open({ kind: "workspace", workspaceId: workspace.id })) { setReadyGroup(undefined); setTool("work"); requestWorkFocus() } }
  const followTask = (taskId: string) => {
    if (!workspace || !tasks.some(task => task.id === taskId && task.workspaceId === workspace.id)) {
      void graph.reload()
      setMutationError("Refreshing the task. Choose Follow agent again after the workspace is current.")
      return
    }
    setMutationError(null)
    setNavigation(state => navigateCanvas(state, { kind: "task", workspaceId: workspace.id, taskId }, "agent"))
  }
  const changeTool = (next: Tool) => { if (canLeave()) { dismissPendingLocation(); stopFollowing(); if (next === "tasks") setTasksMounted(true); if (next === "ready" || next === "work") setReadyGroup(undefined); setTool(next); requestWorkFocus() } }
  const changeWorkspace = (id: string) => {
    if (!canLeaveAll() || writing.current) return
    dismissPendingLocation()
    dirty.current = { tasks: false, settings: false }; dirtyEditorTask.current = undefined
    setWorkOpen(true); setWorkMounted(true); setTool("work"); setTasksMounted(false); setMutationError(null); setQuickAdd(0)
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
  const signOut = async () => {
    if (loggingOut || !canLeaveAll()) return
    setLoggingOut(true); setMutationError(null)
    try {
      const result = await logout()
      if (result.error) { setMutationError(result.error); return }
      clearAccountDrafts(`saathi:draft:${encodeURIComponent(account)}:`)
      try { window.localStorage.setItem("auth-change", Date.now().toString()) } catch { /* Logout already committed. */ }
      router.replace("/login")
    } catch { setMutationError("Unable to sign out. Please try again.") }
    finally { setLoggingOut(false) }
  }
  const accessDenied = Boolean(workspace && !capabilityCeiling.read)
  const workspaceUnavailable = Boolean(store.workspaceError || companies.error || graph.error || accessDenied)
  const broadSearch = focused.kind === "overview" || focused.kind === "resource"
  const commandDisabled = loggingOut || store.loading || companies.loading || Boolean(store.workspaceError || companies.error) || (!broadSearch && (!workspace || !graph.entry || graph.loading || workspaceUnavailable || !capabilityCeiling.read))
  const showWorkArea = workOpen && Boolean(graph.entry && capabilityCeiling.read)
  const taskTool = ["work", "ready", "tasks", "prerequisites"].includes(tool)
  const taskInspectorOpen = Boolean(selectedTask && taskTool)
  const boardReadiness = workspace ? projection.readiness.get(workspace.id) : undefined
  const inWorkspace = Boolean(workspace && (focused.kind === "workspace" || focused.kind === "task") && graph.entry && capabilityCeiling.read && !workspaceUnavailable && boardReadiness)
  const showBoard = layout === "board" && inWorkspace
  // On the board the lanes already list every task, so the side list only opens for a task, the editor or another tool.
  const boardListHidden = showBoard && taskTool && tool !== "tasks" && !taskInspectorOpen
  const panelOpen = showWorkArea && !boardListHidden
  useLayoutEffect(() => {
    const target = taskInspectorOpen ? taskSummaryBack.current : workTools.current
    if (workFocusRequested.current && showWorkArea && target) {
      workFocusRequested.current = false
      target.focus()
    }
  }, [workFocusRevision, showWorkArea, taskInspectorOpen])
  const dockClearance = "bottom-0"
  const commands = <CanvasCommandBar key={`${account}:${workspace?.id ?? "none"}`} placement="header" onCreateWorkspace={focused.kind === "overview" ? beginCreateWorkspace : undefined} scopeName={breadcrumbs.map(item => item.label).join(" / ")} scopeLabel={breadcrumbs.at(-1)?.label ?? "Canvas"}
    searchScope={broadSearch ? focused.kind === "resource" ? { resourceId: focused.resourceId } : {} : undefined} searchRevision={JSON.stringify([actorId, store.realtime.eventRevision, revision, companies.resources, store.workspaces.map(item => item.id)])}
    tasks={tasks} selectedTask={selectedTask} canComplete={canComplete} canCreate={!broadSearch && (capabilityCeiling.create ?? false)} canEdit={capabilityCeiling.edit} canManage={isOwner && capabilityCeiling.manage} busy={saving} disabled={commandDisabled} onOpenTask={openTask} onCreate={createTask} onComplete={() => void complete()}
    onNavigate={path => { if (canLeaveAll()) router.push(path) }}
    onTool={next => { if (!broadSearch && workspace && !commandDisabled && canLeave()) { dismissPendingLocation(); stopFollowing(); setTool(next); setWorkMounted(true); setWorkOpen(true); requestWorkFocus() } }}
    onWorkspace={openWorkspace} onList={openWorkspace} followingAgent={navigation.followingAgent} onStopFollowing={stopFollowing} />
  return <main className="saathi-dashboard relative h-dvh min-h-0 overflow-hidden bg-background text-foreground">
    <header onPointerDownCapture={stopFollowing} className="absolute inset-x-0 top-0 z-20 flex h-28 flex-wrap items-center gap-x-2 border-b border-border bg-card px-3 sm:h-16 sm:flex-nowrap sm:px-5">
      <h1 className="sr-only">Canvas</h1>
      <nav aria-label="Canvas hierarchy" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[35%]">
        <Button size="sm" variant="ghost" className="size-11 shrink-0 px-0 sm:w-auto sm:px-3" aria-label="Back" title="Back" disabled={focused.kind === "overview"} onClick={() => open(parentCanvasFocus(focused, companies.resources))}><ArrowLeft className="size-4" /><span className="hidden sm:inline">Back</span></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button ref={locationButton} variant="ghost" className="h-11 min-w-0 flex-1 justify-between gap-2 px-2 text-base font-semibold sm:flex-initial sm:max-w-xl" aria-label={"Canvas location: " + (breadcrumbs.at(-1)?.label ?? "Canvas")} aria-current="location" data-workspace-id={workspace?.id} title={breadcrumbs.map(item => item.label).join(" / ")}><span className="truncate">{breadcrumbs.at(-1)?.label ?? "Canvas"}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" aria-labelledby={undefined} aria-label="Canvas locations" className="w-[min(28rem,calc(100vw-1.5rem))]">
            {breadcrumbs.map((item, index) => <DropdownMenuItem key={JSON.stringify(item.focus)} data-workspace-id={item.focus.kind === "workspace" ? item.focus.workspaceId : undefined} data-canvas-label={item.label} data-canvas-focus={JSON.stringify(item.focus)} aria-current={index === breadcrumbs.length - 1 ? "location" : undefined} className="block min-h-11 whitespace-normal break-words py-3" onSelect={() => { open(item.focus) }}>{breadcrumbs.slice(0, index + 1).map(ancestor => ancestor.label).join(" / ")}</DropdownMenuItem>)}
            {store.workspaces.length > 0 && <DropdownMenuSeparator />}
            {store.workspaces.filter(item => !breadcrumbs.some(crumb => crumb.focus.kind === "workspace" && crumb.focus.workspaceId === item.id)).map(item => <DropdownMenuItem key={item.id} data-workspace-id={item.id} className="block min-h-11 whitespace-normal break-words py-3" disabled={saving} onSelect={() => changeWorkspace(item.id)}>{item.name}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <div className="order-last w-full pb-2 sm:order-none sm:min-w-0 sm:flex-1 sm:pb-0">{commands}</div>
      {inWorkspace && <div role="group" aria-label="Workspace layout" className="flex h-11 shrink-0 items-center rounded-md border border-border bg-background p-1">
        <Button variant={layout === "board" ? "secondary" : "ghost"} size="sm" className="h-9 px-2.5" aria-pressed={layout === "board"} onClick={() => chooseLayout("board")}><Columns3 className="size-4" /><span className="hidden md:inline">Board</span></Button>
        <Button variant={layout === "map" ? "secondary" : "ghost"} size="sm" className="h-9 px-2.5" aria-pressed={layout === "map"} onClick={() => chooseLayout("map")}><MapIcon className="size-4" /><span className="hidden md:inline">Map</span></Button>
      </div>}
      {showWorkArea && !showBoard && <Button variant="outline" size="sm" className="h-11 min-w-11 shrink-0 px-3" aria-label="Show canvas" title="Show canvas" onClick={() => { if (canLeave()) { stopFollowing(); setWorkOpen(false); locationButton.current?.focus() } }}><MapIcon className="size-4" /><span className="hidden sm:inline">Canvas</span></Button>}
      {showBoard && panelOpen && <Button variant="outline" size="sm" className="h-11 shrink-0 px-3" aria-label="Close panel" onClick={() => { if (canLeave()) { stopFollowing(); if (taskInspectorOpen) openWorkspace(); else setWorkOpen(false) } }}>Close</Button>}
      {showBoard && !panelOpen && <Button size="sm" variant="outline" className="h-11 shrink-0 px-3" aria-label="Open agent runs" disabled={commandDisabled} onClick={() => { if (canLeave()) { stopFollowing(); setWorkMounted(true); setWorkOpen(true); changeTool("agents") } }}>Agents</Button>}
      <Button size="sm" variant="outline" className={"h-11 shrink-0 px-3 disabled:opacity-100 " + (broadSearch || showWorkArea || showBoard ? "hidden" : "")} aria-label="Open workspace tools" disabled={commandDisabled || broadSearch} onClick={openWorkspace}><List className="size-4" /><span>Tasks</span></Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Canvas menu"><MoreHorizontal className="size-5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-labelledby={undefined} aria-label="Canvas menu">
          <DropdownMenuItem className="min-h-11" disabled={store.loading || saving} onSelect={() => { void refreshAll() }}><RefreshCw className="size-4" />Refresh canvas</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" aria-label="Company setup" onSelect={() => { if (canLeave()) { setCompanyResourceId(null); setCompanyOpen(true) } }}><Building2 className="size-4" />Company setup</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" aria-label="Create workspace" onSelect={beginCreateWorkspace}><Plus className="size-4" />Create workspace</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11" onSelect={() => { if (canLeaveAll()) setInvitationsOpen(true) }}>Invitations</DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-11"><Link href="/connections" onClick={event => { if (!canLeaveAll()) event.preventDefault() }}>Connections</Link></DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-11"><Link href="/archive" onClick={event => { if (!canLeaveAll()) event.preventDefault() }}>Archive</Link></DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-11"><Link href="/guide" onClick={event => { if (!canLeaveAll()) event.preventDefault() }}>Help</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <ThemeMenuItems />
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11" disabled={loggingOut} onSelect={() => void signOut()}>{loggingOut ? "Signing out…" : "Sign out"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    <div className={`absolute inset-x-0 top-28 grid grid-cols-1 overflow-y-auto sm:top-16 lg:overflow-hidden ${panelOpen ? taskInspectorOpen ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : taskTool ? "lg:grid-cols-[minmax(0,1fr)_24rem]" : "lg:grid-cols-[minmax(0,1fr)_minmax(24rem,40rem)]" : ""} ${dockClearance}`}>
      {store.loading ? <p role="status" className="p-6">Loading workspaces…</p>
        : store.workspaceError ? <div role="alert" className="m-6 space-y-3"><p>{store.workspaceError}</p><Button onClick={() => void store.refreshWorkspaces()}>Try again</Button></div>
        : companies.loading ? <p role="status" className="p-6">Loading companies…</p>
        : companies.error ? <div role="alert" className="m-6 space-y-3"><p>{companies.error}</p><Button onClick={() => void refreshAll()}>Try again</Button></div>
        : !workspace && store.workspaces.length === 0 && companies.resources.length === 0 ? <div className="grid h-full place-items-center overflow-y-auto p-6"><section aria-labelledby="welcome-title" className="w-full max-w-xl space-y-6">
          <div className="space-y-2"><p className="saathi-label text-muted-foreground">Welcome to Saathi</p><h2 id="welcome-title" className="saathi-display text-3xl">Create a workspace</h2>
            <p className="text-sm leading-6 text-muted-foreground">A workspace holds one project&apos;s tasks. You, your team and your AI agents all work from the same list, and Saathi keeps track of what can start next.</p></div>
          <ol className="space-y-3">{[
            ["Create a workspace", "Give it a name and, if you like, a goal and a date."],
            ["Add tasks and say what waits on what", "A task that waits on another stays in Waiting until that one is done."],
            ["Work from Up next, or connect an agent", "Agents claim ready tasks over MCP. You review what they hand back."],
          ].map(([title, body], index) => <li key={title} className="flex gap-3 rounded-lg border border-border bg-card p-3"><span aria-hidden="true" className="saathi-display grid size-7 shrink-0 place-items-center rounded-md bg-accent text-sm text-accent-foreground">{index + 1}</span><span><span className="block text-sm font-semibold">{title}</span><span className="block text-sm text-muted-foreground">{body}</span></span></li>)}</ol>
          <div className="flex flex-wrap gap-2"><Button onClick={beginCreateWorkspace}><Plus className="size-4" />Create workspace</Button><Button asChild variant="ghost"><Link href="/guide">How Saathi works</Link></Button></div>
        </section></div>
        : graph.error || accessDenied ? <div role="alert" className="m-6 space-y-3"><p>{graph.error ?? "Workspace unavailable or access denied"}</p><Button onClick={() => void refreshAll()}>Try again</Button></div>
        : showBoard && workspace && graph.entry && boardReadiness ? <div className="relative h-full min-h-80 min-w-0"><WorkBoard workspace={workspace} tasks={tasks} dependencies={graph.entry.graph.dependencies} readiness={boardReadiness} selectedTaskId={selectedTask?.id ?? null}
            canCreate={capabilityCeiling.create ?? false} busy={saving} onInspect={id => { stopFollowing(); inspectTask(id) }} onCreate={createTask} /></div>
        : <><div role="region" aria-label="Workspace canvas" className={`relative min-w-0 ${showWorkArea ? "h-[min(55dvh,30rem)] min-h-80 lg:h-full lg:min-h-0" : "h-full min-h-80"}`}><ReactFlowProvider key={`${actorId}:${scope.canvasId}`}><CanvasFlow onFitWorkspace={() => {
            if (focused.kind !== "workspace" || fitWorkspaceId === focused.workspaceId) return false
            setFitWorkspaceId(focused.workspaceId)
            return true
          }} compact={compactCanvas} restoreReady={locationInitialized} projection={projection} cameraKey={`${cameraStorageKey(scope)}:blockers-v1${fittedWorkspace ? ":workspace-graph" : ""}`} onOpen={focus => open(focus)} ready={!graph.loading && !companies.loading && !companies.error}
          resources={companies.resources} references={companies.references} workspaces={store.workspaces} focus={currentNavigation.focus} followingAgent={navigation.followingAgent} onOpenResource={id => open({ kind: "resource", resourceId: id })}
          onViewportWidthChange={reportCanvasWidth}
          onZoom={value => setZoom(previous => (previous < 0.55) === (value < 0.55) ? previous : value)}
          onOpenGroup={(workspaceId, readiness) => { if (workspaceId !== workspace?.id || graph.loading || !capabilityCeiling.read || !open({ kind: "workspace", workspaceId })) return; stopFollowing(); setReadyGroup(readiness); setTool("work"); requestWorkFocus() }}
          onManualNavigation={stopFollowing} /></ReactFlowProvider></div>

          {graph.loading && <p role="status" className="absolute bottom-2 left-4 rounded bg-card px-3 py-1 text-sm">Refreshing…</p>}

        </>}
      {workspace && graph.entry && capabilityCeiling.read && !workspaceUnavailable && workMounted && <aside aria-label="Workspace work area" className={`saathi-mobile-controls ${workOpen && !boardListHidden ? "" : "hidden"} relative z-10 min-h-80 w-full border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0`}>
        <div hidden={taskInspectorOpen} className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <select ref={workTools} aria-label="Workspace tools" value={taskTool ? "work" : tool} className="min-h-11 min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-sm" onChange={event => changeTool(event.target.value as Tool)}>
              <option value="work">Tasks</option>
              <option value="agents">Agent runs</option><option value="team">Team</option><option value="activity">History</option>
              {isOwner && capabilityCeiling.manage && <option value="settings">Settings</option>}
            </select>

          </div>
        </div>
        <div hidden={!taskTool}>
        {tasksMounted && <div hidden={tool !== "tasks"}><WorkspaceBoard editorOnly snapshotTasks={tasks} compactToolbar key={workspace.id} workspace={workspace} currentUserEmail={email}
          refreshSignal={store.realtime.eventRevision + revision} openTaskRequest={openTaskRequest} openTaskId={tool === "tasks" ? selectedTask?.id ?? null : null} commentRefreshEvent={store.realtime.lastEvent} capabilityCeiling={capabilityCeiling}
          focusQuickAdd={quickAdd} onQuickAddOpenChange={setQuickAddOpen} draftScope={draftScope} onChanged={graph.reload} onOpenTask={openTask} active={workOpen && tool === "tasks"} onDirtyChange={(value, active = value, editorDraftTaskId) => { dirty.current.tasks = value; dirty.current.activeTasks = active; dirtyEditorTask.current = editorDraftTaskId }}
          onAddTask={async (...args) => { const result = await store.addTask(...args); if (!getMutationError(result)) setRevision(value => value + 1); return result }} /></div>}
        {projection.readiness.get(workspace.id) && <CanvasTaskPanel key={`${actorId}:${workspace.id}`} backButtonRef={taskSummaryBack} creating={tool === "tasks" && quickAddOpen} workspace={workspace} tasks={tasks} dependencies={graph.entry.graph.dependencies} readiness={projection.readiness.get(workspace.id)!} selectedTask={selectedTask} group={readyGroup ?? null} onGroupChange={group => { if (canLeave()) { dismissPendingLocation(); stopFollowing(); setReadyGroup(group ?? undefined); setTool("work") } }} onInspect={inspectTask} onBack={openWorkspace} onEdit={openTask} onCreate={createTask} onComplete={() => void complete()} canCreate={capabilityCeiling.create} canEdit={canEditSelected} canComplete={canComplete} busy={saving || graph.loading} currentUserEmail={email} refreshSignal={store.realtime.eventRevision + revision} onChanged={graph.reload} />}
        </div>
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
    <Dialog open={invitationsOpen} onOpenChange={setInvitationsOpen}><DialogContent className="saathi-mobile-controls max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Invitations</DialogTitle><DialogDescription className="sr-only">Respond to workspace invitations for this account.</DialogDescription></DialogHeader>{invitationsOpen && <InvitationNotifications userEmail={email} onInvitationAccepted={async id => { await refreshAll(); changeWorkspace(id); setInvitationsOpen(false) }} />}</DialogContent></Dialog>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="saathi-mobile-controls max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Create workspace</DialogTitle><DialogDescription className="sr-only">Create a workspace using its name, goal and target date.</DialogDescription></DialogHeader>{createTarget ? <ContextualWorkspaceCreate actorId={actorId} target={createTarget} onCancel={() => setCreateOpen(false)} onCreated={async id => { const refreshed = await Promise.all([store.refreshWorkspaces(), companies.reload()]); setRevision(value => value + 1); if (!refreshed.every(Boolean)) throw new Error("Canvas refresh incomplete"); dirty.current = { tasks: false, settings: false }; dirtyEditorTask.current = undefined; setQuickAdd(0); setTasksMounted(false); store.setCurrentWorkspaceId(id); setNavigation(state => navigateCanvas(state, { kind: "workspace", workspaceId: id }, "manual")); setCreateOpen(false); setWorkOpen(false); setWorkMounted(false) }} /> : <WorkspaceCreateForm actorId={actorId} account={account} compact aiEnabled={aiEnabled} canCancel onCancel={() => setCreateOpen(false)}
      onCreate={async (name, details, commandId) => { const result = await store.createWorkspace(name, details, commandId, actorId); if (result?.error || !result?.workspace) return { error: result?.error ?? "Unable to confirm workspace creation.", rejected: result?.rejected }; setCreateOpen(false); if (result.workspace.archivedAt) { setMutationError("The workspace was already created and is now archived."); return {} }; setNavigation(navigateCanvas(createCanvasNavigation(scope), { kind: "workspace", workspaceId: result.workspace.id }, "manual")); setWorkOpen(false); setWorkMounted(false) }}
      onSuggest={generateWorkspaceDraft} onApprove={async (plan, commandId) => {
        const result = await createWorkspaceFromPlan(plan, commandId, actorId)
        if (result.error || !result.workspace) return { error: result.error ?? "Unable to confirm workspace creation.", rejected: result.unknownOutcome === false }
        setCreateOpen(false)
        if (result.workspace.archivedAt) { setMutationError("The workspace was already created and is now archived."); return {} }
        setWorkOpen(false); setWorkMounted(false); setNavigation(navigateCanvas(createCanvasNavigation(scope), { kind: "workspace", workspaceId: result.workspace.id }, "manual"))
        try { if (!await store.refreshWorkspaces()) throw new Error("Refresh incomplete"); store.setCurrentWorkspaceId(result.workspace.id) }
        catch { setMutationError("Workspace created. Refresh the canvas to see it.") }
        return {}
      }} />}</DialogContent></Dialog>
    <Dialog open={companyOpen} onOpenChange={setCompanyOpen}><DialogContent className="saathi-mobile-controls max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Company canvas</DialogTitle><DialogDescription className="sr-only">Manage companies, sections and their explicit access grants.</DialogDescription></DialogHeader>
      {companies.error ? <div role="alert" className="space-y-3"><p>{companies.error}</p><Button onClick={() => void companies.reload()}>Try again</Button></div> : companies.loading ? <p role="status">Loading companies…</p>
        : <CompanyPanel key={actorId} actorId={actorId} resources={companies.resources} workspace={workspace} initialResourceId={companyResourceId} refreshSignal={store.realtime.eventRevision + revision} onChanged={refreshAll}
          onWorkspace={id => { setCompanyOpen(false); changeWorkspace(id) }} onInvite={id => { if (store.workspaces.some(item => item.id === id) && (id === workspace?.id ? canLeave() : canLeaveAll())) { if (workspace?.id !== id) { dirty.current = { tasks: false, settings: false }; dirtyEditorTask.current = undefined; setQuickAdd(0); store.setCurrentWorkspaceId(id) } setNavigation(state => navigateCanvas(state, { kind: "workspace", workspaceId: id }, "manual")); setCompanyOpen(false); setTool("team"); setWorkMounted(true); setWorkOpen(true) } }} />}
    </DialogContent></Dialog>
  </main>
}
