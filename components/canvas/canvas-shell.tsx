"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { ArrowLeft, Building2, List, Plus, RefreshCw, X } from "lucide-react"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useCanvasGraph } from "@/hooks/use-canvas-graph"
import { WorkspaceBoard } from "@/components/workspace-board"
import { WorkspaceCreateForm } from "@/components/workspace-create-form"
import { NextWorkView } from "@/components/next-work-view"
import { MemberManager } from "@/components/member-manager"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { ActivityHistory } from "@/components/activity-history"
import { Button } from "@/components/ui/button"
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

const CanvasFlow = dynamic(() => import("./canvas-flow"), { ssr: false,
  loading: () => <p role="status" className="p-6">Loading canvas…</p> })
type Tool = "tasks" | "prerequisites" | "team" | "settings" | "activity" | "agents"

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
  const [tool, setTool] = useState<Tool>("tasks")
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
  const dirty = useRef({ tasks: false, settings: false })
  const currentScope = useRef(workspace?.id)
  useLayoutEffect(() => { currentScope.current = workspace?.id }, [workspace?.id])
  const projection = useMemo(() => projectCanvas({ graphs, resources: companies.resources, navigation: currentNavigation, zoom }), [graphs, companies.resources, currentNavigation, zoom])
  const tasks = graph.entry?.graph.tasks ?? []
  const taskReadiness = useMemo(() => new Map(projection.nodes.filter(node => node.kind === "task").map(node => [node.recordId, node.readiness])), [projection.nodes])
  const listedTasks = listReadiness ? tasks.filter(task => taskReadiness.get(task.id) === listReadiness) : tasks
  const readinessNames = { ready: "Ready", waiting: "Waiting", completed_inconsistent: "Review", completed: "Completed" }
  const focused = currentNavigation.focus
  const focusedKey = JSON.stringify(focused)
  const currentBreadcrumb = useRef<HTMLButtonElement | null>(null)
  useLayoutEffect(() => { currentBreadcrumb.current?.scrollIntoView({ block: "nearest", inline: "end" }) }, [focusedKey, workOpen])
  const selectedTask = focused.kind === "task"
    ? tasks.find(task => task.id === focused.taskId) ?? null : null
  const isOwner = workspace ? account === normalizeEmail(workspace.ownerId) : false
  const capabilityCeiling = useMemo(() => Object.fromEntries(ACCESS_CAPABILITIES.map(capability => [capability, Boolean(workspace && permitsCapability(workspace.capabilityCeiling, capability))])), [workspace])
  const canComplete = Boolean(capabilityCeiling.edit && workspace && selectedTask && canChangeTask({ ownerId: normalizeEmail(workspace.ownerId),
    creatorId: normalizeEmail(selectedTask.createdBy), assigneeId: selectedTask.assigneeEmail ? normalizeEmail(selectedTask.assigneeEmail) : undefined }, account, "toggle"))
  const canLeave = useCallback(() => !Object.values(dirty.current).some(Boolean) || window.confirm("Leave this work area? Your unfinished draft will be kept for recovery."), [])
  const stopFollowing = useCallback(() => setNavigation(state => state.followingAgent ? { ...state, followingAgent: false } : state), [setNavigation])
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
    if (focus.kind === "task" && Object.values(dirty.current).some(Boolean)) {
      setMutationError("Save or discard the open draft before opening another task.")
      return
    }
    if (!canLeave()) return
    if ((focus.kind === "workspace" || focus.kind === "task") && focus.workspaceId !== store.currentWorkspaceId) {
      dirty.current = { tasks: false, settings: false }
      setQuickAdd(0)
      store.setCurrentWorkspaceId(focus.workspaceId)
    }
    setNavigation(state => navigateCanvas(state, focus, "manual"))
    if (focus.kind === "task") { setOpenTaskRequest(value => value + 1); setWorkOpen(true); setWorkMounted(true); setTool("tasks") }
    else setWorkOpen(false)
    return true
  }, [canLeave, setNavigation, setWorkOpen, setWorkMounted, setTool, setMutationError, setQuickAdd, setOpenTaskRequest, store])
  const openTask = (id: string, workspaceId = workspace?.id) => { if (workspaceId && store.workspaces.some(item => item.id === workspaceId)) return open({ kind: "task", workspaceId, taskId: id }) }
  const openWorkspace = () => { if (workspace && open({ kind: "workspace", workspaceId: workspace.id })) { setWorkOpen(true); setWorkMounted(true) } }
  const followTask = (taskId: string) => {
    if (!workspace || !tasks.some(task => task.id === taskId && task.workspaceId === workspace.id)) {
      void graph.reload()
      setMutationError("Refreshing the task. Choose Follow agent again after the workspace is current.")
      return
    }
    setMutationError(null)
    setNavigation(state => navigateCanvas(state, { kind: "task", workspaceId: workspace.id, taskId }, "agent"))
  }
  const changeTool = (next: Tool) => { if (canLeave()) { stopFollowing(); setTool(next) } }
  const changeWorkspace = (id: string) => {
    if (!canLeave() || writing.current) return
    dirty.current = { tasks: false, settings: false }
    setWorkOpen(false); setWorkMounted(false); setListOpen(false); setMutationError(null); setQuickAdd(0)
    setNavigation(createCanvasNavigation(scope))
    store.setCurrentWorkspaceId(id)
  }
  const beginCreateWorkspace = () => {
    if (!canLeave()) return
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
    setNavigation(state => navigateCanvas(state, { kind: "workspace", workspaceId: workspace.id }, "manual"))
    setTool("tasks"); setWorkOpen(true); setWorkMounted(true); setQuickAdd(value => value + 1)
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
  return <main className="saathi-dashboard relative h-dvh overflow-hidden bg-background text-foreground">
    <header onPointerDownCapture={stopFollowing} className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/95 px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2"><Button asChild variant="ghost" size="icon" className="size-9"><Link href="/dashboard" aria-label="Open dashboard" onClick={event => { if (!canLeave()) event.preventDefault() }}><ArrowLeft className="size-4" /></Link></Button><h1 className="sr-only text-lg font-semibold tracking-tight sm:not-sr-only">Canvas</h1>
        {store.workspaces.length > 0 && <select aria-label="Current workspace" value={workspace?.id ?? ""} onChange={event => changeWorkspace(event.target.value)} disabled={saving} className="max-w-[35vw] rounded-lg border border-border bg-background px-2 py-2 text-sm sm:max-w-[40vw]">{store.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      </div>
      <div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="size-9" aria-label="Refresh canvas" disabled={store.loading || saving} onClick={() => void refreshAll()}><RefreshCw className="size-4" /></Button><Button variant="outline" size="sm" className="size-9 px-0 sm:h-9 sm:w-auto sm:px-3" aria-label="Manage canvas" onClick={() => { if (canLeave()) { setCompanyResourceId(null); setCompanyOpen(true) } }}><Building2 className="size-4" /><span className="hidden sm:inline">Manage</span></Button><Button variant="outline" size="sm" className="size-9 px-0 sm:h-9 sm:w-auto sm:px-3" aria-label="Create workspace" onClick={beginCreateWorkspace}><Plus className="size-4" /><span className="hidden sm:inline">Workspace</span></Button></div>
    </header>
    <div className="absolute inset-x-0 bottom-28 top-16">
      {store.loading ? <p role="status" className="p-6">Loading workspaces…</p>
        : store.workspaceError ? <div role="alert" className="m-6 space-y-3"><p>{store.workspaceError}</p><Button onClick={() => void store.refreshWorkspaces()}>Try again</Button></div>
        : companies.loading ? <p role="status" className="p-6">Loading companies…</p>
        : companies.error ? <div role="alert" className="m-6 space-y-3"><p>{companies.error}</p><Button onClick={() => void refreshAll()}>Try again</Button></div>
        : !workspace && store.workspaces.length === 0 && companies.resources.length === 0 ? <div className="grid h-full place-items-center"><div className="space-y-4 text-center"><h2 className="text-2xl font-semibold">Create a workspace</h2><Button onClick={beginCreateWorkspace}>Create workspace</Button></div></div>
        : graph.error || accessDenied ? <div role="alert" className="m-6 space-y-3"><p>{graph.error ?? "Workspace unavailable or access denied"}</p><Button onClick={() => void refreshAll()}>Try again</Button></div>
        : <><div role="region" aria-label="Workspace canvas" className={`relative ${showWorkArea ? "h-[42%] lg:h-full lg:w-[48%]" : "h-full"}`}><ReactFlowProvider key={`${actorId}:${scope.canvasId}`}><CanvasFlow projection={projection} cameraKey={cameraStorageKey(scope)} onOpen={open} ready={!graph.loading && !companies.loading && !companies.error}
          resources={companies.resources} references={companies.references} workspaces={store.workspaces} focus={currentNavigation.focus} followingAgent={navigation.followingAgent} onOpenResource={id => open({ kind: "resource", resourceId: id })}
          onZoom={value => setZoom(previous => (previous < 0.55) === (value < 0.55) ? previous : value)}
          onOpenGroup={(workspaceId, readiness) => { if (workspaceId === workspace?.id && !graph.loading && capabilityCeiling.read) { stopFollowing(); setListReadiness(readiness); setListOpen(true) } }}
          onManualNavigation={stopFollowing} /></ReactFlowProvider></div>
          <nav aria-label="Canvas hierarchy" className={`absolute left-3 right-3 top-3 flex items-center gap-2 ${showWorkArea ? "lg:right-[calc(52%+0.75rem)]" : ""}`}>
            <Button size="sm" variant="outline" disabled={focused.kind === "overview"} onClick={() => open(parentCanvasFocus(focused, companies.resources))}>Back</Button>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">{canvasBreadcrumbs(focused, companies.resources, store.workspaces, tasks).map((item, index, path) => <Button key={JSON.stringify(item.focus)} size="sm" variant="outline" className="max-w-40 shrink-0 truncate" ref={index === path.length - 1 ? currentBreadcrumb : undefined} aria-current={index === path.length - 1 ? "location" : undefined} onClick={() => open(item.focus)}>{item.label}</Button>)}</div>
            <Button size="sm" variant="outline" aria-label="Open workspace tools" disabled={commandDisabled} onClick={openWorkspace}><List className="size-4" />Tools</Button>
          </nav>
          {graph.loading && <p role="status" className="absolute bottom-2 left-4 rounded bg-card px-3 py-1 text-sm">Refreshing…</p>}

        </>}
      {workspace && graph.entry && capabilityCeiling.read && !workspaceUnavailable && workMounted && <aside aria-label="Workspace work area" className={`${workOpen ? "" : "hidden"} absolute bottom-0 top-[42%] right-0 z-10 w-full overflow-y-auto border-t border-border bg-background lg:top-0 lg:w-[52%] lg:border-l lg:border-t-0`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
          <h2 className="min-w-0 truncate font-semibold">{selectedTask?.title ?? workspace.name}</h2>
          <div className="flex items-center gap-2">
            <select aria-label="Workspace tools" value={tool} className="rounded border border-border bg-background px-2 py-1 text-sm" onChange={event => changeTool(event.target.value as Tool)}>
              <option value="tasks">Tasks</option>
              {capabilityCeiling.edit && <option value="prerequisites">Prerequisites</option>}
              <option value="agents">Agent runs</option><option value="team">Team</option><option value="activity">History</option>
              {isOwner && capabilityCeiling.manage && <option value="settings">Settings</option>}
            </select>
            <Button size="icon" variant="ghost" aria-label="Close work area" onClick={() => { if (canLeave()) { stopFollowing(); setWorkOpen(false) } }}><X className="size-4" /></Button>
          </div>
        </div>
        <div hidden={tool !== "tasks"}><WorkspaceBoard compactToolbar key={workspace.id} workspace={workspace} currentUserEmail={email}
          refreshSignal={store.realtime.eventRevision + revision} openTaskRequest={openTaskRequest} openTaskId={tool === "tasks" ? selectedTask?.id ?? null : null} commentRefreshEvent={store.realtime.lastEvent} capabilityCeiling={capabilityCeiling}
          focusQuickAdd={quickAdd} draftScope={draftScope} onDirtyChange={value => { dirty.current.tasks = value }}
          onAddTask={async (...args) => { const result = await store.addTask(...args); if (!getMutationError(result)) setRevision(value => value + 1); return result }} /></div>
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
    {mutationError && <p role="alert" className="absolute inset-x-4 bottom-28 z-30 mx-auto max-w-3xl rounded-lg border border-destructive/30 bg-card p-3 text-sm">{mutationError}</p>}
    <CanvasCommandBar key={`${account}:${workspace?.id ?? "none"}`} scopeName={canvasBreadcrumbs(focused, companies.resources, store.workspaces, tasks).map(item => item.label).join(" / ")}
      searchScope={broadSearch ? focused.kind === "resource" ? { resourceId: focused.resourceId } : {} : undefined} searchRevision={JSON.stringify([actorId, store.realtime.eventRevision, revision, companies.resources, store.workspaces.map(item => item.id)])}
      tasks={tasks} selectedTask={selectedTask} canComplete={canComplete} canCreate={!broadSearch && (capabilityCeiling.create ?? false)} busy={saving} disabled={commandDisabled} onOpenTask={openTask} onCreate={createTask} onComplete={() => void complete()} onWorkspace={openWorkspace} onList={() => { stopFollowing(); setListReadiness(null); setListOpen(true) }} followingAgent={navigation.followingAgent} onStopFollowing={stopFollowing} />
    <Dialog open={listOpen} onOpenChange={setListOpen}><DialogContent className="max-h-[80dvh] overflow-y-auto"><DialogHeader><DialogTitle>{listReadiness ? readinessNames[listReadiness] : workspace?.name ?? "Workspace"} tasks</DialogTitle><DialogDescription className="sr-only">Open a task from the current authorized workspace.</DialogDescription></DialogHeader>
      {graph.error ? <p role="alert">{graph.error}</p> : graph.loading && !graph.entry ? <p role="status">Loading tasks…</p> : <ul className="space-y-2">{listedTasks.map(task => <li key={task.id}><Button variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => { openTask(task.id); setListOpen(false) }}>{task.title}<span className="ml-auto pl-3 text-xs text-muted-foreground">{taskReadiness.get(task.id)?.replaceAll("_", " ")}</span></Button></li>)}</ul>}
      {!graph.loading && !graph.error && listedTasks.length === 0 && <p>{listReadiness ? "No tasks in this group." : "No tasks in this workspace."}</p>}
    </DialogContent></Dialog>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Create workspace</DialogTitle><DialogDescription className="sr-only">Create a workspace using its name, goal and target date.</DialogDescription></DialogHeader>{createTarget ? <ContextualWorkspaceCreate actorId={actorId} target={createTarget} onCancel={() => setCreateOpen(false)} onCreated={async id => { const refreshed = await Promise.all([store.refreshWorkspaces(), companies.reload()]); setRevision(value => value + 1); if (!refreshed.every(Boolean)) throw new Error("Canvas refresh incomplete"); dirty.current = { tasks: false, settings: false }; setQuickAdd(0); store.setCurrentWorkspaceId(id); setNavigation(state => navigateCanvas(state, { kind: "workspace", workspaceId: id }, "manual")); setCreateOpen(false); setWorkOpen(false); setWorkMounted(false) }} /> : <WorkspaceCreateForm compact aiEnabled={false} canCancel onCancel={() => setCreateOpen(false)}
      onCreate={async (name, details) => { await store.createWorkspace(name, details); setCreateOpen(false); setNavigation(createCanvasNavigation(scope)); setWorkOpen(false); setWorkMounted(false) }}
      onSuggest={async () => ({ error: "Planning assistance is unavailable here." })} onApprove={async () => ({ error: "Use manual workspace creation." })} />}</DialogContent></Dialog>
    <Dialog open={companyOpen} onOpenChange={setCompanyOpen}><DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Company canvas</DialogTitle><DialogDescription className="sr-only">Manage companies, sections and their explicit access grants.</DialogDescription></DialogHeader>
      {companies.error ? <div role="alert" className="space-y-3"><p>{companies.error}</p><Button onClick={() => void companies.reload()}>Try again</Button></div> : companies.loading ? <p role="status">Loading companies…</p>
        : <CompanyPanel key={actorId} actorId={actorId} resources={companies.resources} workspace={workspace} initialResourceId={companyResourceId} refreshSignal={store.realtime.eventRevision + revision} onChanged={refreshAll}
          onWorkspace={id => { setCompanyOpen(false); changeWorkspace(id) }} onInvite={id => { if (store.workspaces.some(item => item.id === id) && canLeave()) { if (workspace?.id !== id) { dirty.current = { tasks: false, settings: false }; setQuickAdd(0); store.setCurrentWorkspaceId(id) } setNavigation(state => navigateCanvas(state, { kind: "workspace", workspaceId: id }, "manual")); setCompanyOpen(false); setTool("team"); setWorkMounted(true); setWorkOpen(true) } }} />}
    </DialogContent></Dialog>
  </main>
}
