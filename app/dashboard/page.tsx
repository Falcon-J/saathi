"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, ChevronDown, CircleHelp, History, Keyboard, LayoutGrid, LogOut, MoreHorizontal, PanelLeft, Plus, RefreshCw, Settings, Sparkles } from "lucide-react"
import { generateWorkspaceDraft, createWorkspaceFromPlan } from "@/app/actions/workspace-intent"
import { archiveWorkspace, deleteWorkspace, transferWorkspaceOwnership } from "@/app/actions/workspaces"
import type { TaskUpdate } from "@/app/tasks/contract"
import { DashboardNavigation } from "@/components/dashboard-navigation"
import { WorkspaceAdvisor } from "@/components/workspace-advisor"
import { confirmWorkspaceAdvisorDraft } from "@/app/actions/workspace-advisor"
import { workspaceViewFromHash, type WorkspaceView } from "@/lib/dashboard-navigation"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ActivityHistory } from "@/components/activity-history"
import { InvitationNotifications } from "@/components/invitation-notifications"
import { MemberManager } from "@/components/member-manager"
import { PageLoader } from "@/components/page-loader"
import { SaathiLogo } from "@/components/saathi-logo"
import { TaskImport } from "@/components/task-import"
import { WorkspaceBoard } from "@/components/workspace-board"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { getDashboardState } from "@/lib/dashboard-state"
import type { WorkspacePlan } from "@/lib/workspace-intent"
import { WorkspaceCreateForm } from "@/components/workspace-create-form"
import { WorkspaceOverview } from "@/components/workspace-overview"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useNotifications } from "@/hooks/use-notifications"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { getSession, logout } from "@/lib/auth-simple"
import { getFeatureCapabilities } from "@/app/actions/capabilities"
import { normalizeEmail } from "@/lib/identity"
import { getMutationError, getThrownErrorMessage } from "@/lib/mutation-result"

type SessionUser = { email: string; username: string }
export default function Dashboard() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [askOpen, setAskOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => typeof window === "undefined" ? "overview" : workspaceViewFromHash(window.location.hash))
  const [taskToOpen, setTaskToOpen] = useState<string | null>(null)
  const [quickAddRequest, setQuickAddRequest] = useState(0)
  const [boardRefreshRequest, setBoardRefreshRequest] = useState(0)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMac, setIsMac] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null)
  const welcomeShownRef = useRef(false)
  const [capabilities, setCapabilities] = useState({ aiWorkspace: false, csvImport: false })
  const aiWorkspaceEnabled = capabilities.aiWorkspace
  const router = useRouter()
  const { success, error, info } = useNotifications()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await getSession()
        if (!session) {
          router.replace("/login")
          return
        }
        setUser(session)
        try {
          setCapabilities(await getFeatureCapabilities())
        } catch {
          setCapabilities({ aiWorkspace: false, csvImport: false })
        }
        const welcomeKey = `saathi:welcome:${session.email}`
        if (!sessionStorage.getItem(welcomeKey) && !welcomeShownRef.current) {
          welcomeShownRef.current = true
          info("Welcome back", `${session.username}, your workspace is ready.`)
          sessionStorage.setItem(welcomeKey, "true")
        }
      } catch (authError) {
        setAuthErrorMessage("Account service is temporarily unavailable.")
      } finally {
        setLoading(false)
      }
    }

    void checkAuth()
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "auth-change") void checkAuth()
    }
    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [info, router])

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes("MAC") || navigator.userAgent.includes("Mac OS X"))
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      setWorkspaceView(workspaceViewFromHash(window.location.hash))
    }
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const {
    workspaces,
    loading: workspacesLoading,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    tasks,
    createWorkspace,
    addTask,
    toggleTask,
    deleteTask,
    editTask,
    addMember,
    removeMember,
    refreshWorkspaces,
    refreshTasks,
    workspaceError,
    taskError,
    tasksLoading,
    realtime,
  } = useWorkspaces(user?.email && !loading ? user.email : undefined, { loadTasks: workspaceView === "overview" })

  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId)
  const isCurrentWorkspaceOwner = currentWorkspace && user
    ? normalizeEmail(currentWorkspace.ownerId) === normalizeEmail(user.email)
    : false

  const handleAuthError = async (caughtError: unknown) => {
    const candidate = caughtError as { message?: string; name?: string }
    if (candidate?.message?.includes("Authentication") || candidate?.name === "AuthenticationError") {
      error("Session expired", "Please sign in again to continue.")
      router.push("/login")
      return true
    }
    return false
  }

  const handleAddTask = async (title: string, description?: string, priority?: "low" | "medium" | "high", dueDate?: string, bucket?: "today" | "next", estimatedMinutes?: number, dueAt?: string) => {
    try {
      const result = await addTask(title, description, priority, dueDate, bucket, estimatedMinutes, dueAt)
      const mutationError = getMutationError(result)
      if (mutationError) {
        error("Failed to create task", mutationError)
        return result
      }
      success("Task created", `“${title}” is now in this workspace.`)
      return result
    } catch (caughtError) {
      if (await handleAuthError(caughtError)) return { error: "Authentication required" }
      const message = getThrownErrorMessage(caughtError, "Unable to create task. Please try again.")
      error("Failed to create task", message)
      return { error: message, unknownOutcome: true }
    }
  }

  const handleToggleTask = async (id: string) => {
    try {
      const task = tasks.find((item) => item.id === id)
      const result = await toggleTask(id)
      const mutationError = getMutationError(result)
      if (mutationError) {
        error("Failed to update task", mutationError)
        return result
      }
      const status = task?.completed ? "reopened" : "completed"
      success(`Task ${status}`, task ? `“${task.title}” has been ${status}.` : "Task status updated.")
      return result
    } catch (caughtError) {
      if (await handleAuthError(caughtError)) return { error: "Authentication required" }
      const message = getThrownErrorMessage(caughtError, "Unable to update task. Please try again.")
      error("Failed to update task", message)
      return { error: message }
    }
  }

  const handleEditTask = async (id: string, updates: TaskUpdate, expectedVersion?: number | string) => {
    try {
      const result = await editTask(id, updates, expectedVersion)
      const mutationError = getMutationError(result)
      if (mutationError) {
        error("Failed to update task", mutationError)
        return result
      }
      success("Task updated", "The task details are current.")
      return result
    } catch (caughtError) {
      if (await handleAuthError(caughtError)) return { error: "Authentication required" }
      const message = getThrownErrorMessage(caughtError, "Unable to update task. Please try again.")
      error("Failed to update task", message)
      return { error: message }
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      const task = tasks.find((item) => item.id === id)
      const result = await deleteTask(id)
      const mutationError = getMutationError(result)
      if (mutationError) {
        error("Failed to delete task", mutationError)
        return result
      }
      success("Task deleted", task ? `“${task.title}” has been deleted.` : "Task has been deleted.")
      return result
    } catch (caughtError) {
      if (await handleAuthError(caughtError)) return { error: "Authentication required" }
      const message = getThrownErrorMessage(caughtError, "Unable to delete task. Please try again.")
      error("Failed to delete task", message)
      return { error: message }
    }
  }

  const finishWorkspaceCreation = (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId)
    setCreatingWorkspace(false)
    setWorkspaceView("overview")
    window.history.replaceState(null, "", "#workspace-header")
  }

  const handleCreateWorkspace = async (name: string, details: { summary: string; targetDate: string | null }) => {
    const workspace = await createWorkspace(name, details)
    if (!workspace) return { error: "Unable to create the workspace." }
    finishWorkspaceCreation(workspace.id)
    return {}
  }

  const handleArchiveWorkspace = async () => {
    if (!currentWorkspace) return
    await archiveWorkspace(currentWorkspace.id, currentWorkspace.version)
    await refreshWorkspaces()
    setWorkspaceView("board")
  }

  const handleDeleteWorkspace = async () => {
    if (!currentWorkspace) return
    await deleteWorkspace(currentWorkspace.id)
    await refreshWorkspaces()
    setWorkspaceView("board")
  }

  const handleTransferOwnership = async (memberUserId: string) => {
    if (!currentWorkspace) return
    await transferWorkspaceOwnership(currentWorkspace.id, memberUserId, currentWorkspace.version)
    await refreshWorkspaces()
  }

  const handleApprovePlan = async (plan: WorkspacePlan) => {
    const result = await createWorkspaceFromPlan(plan)
    if (result.error || !result.workspace) return { error: result.error ?? "Unable to create the workspace." }
    await refreshWorkspaces()
    finishWorkspaceCreation(result.workspace.id)
    return {}
  }

  const handleSelectWorkspace = (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId)
    setCreatingWorkspace(false)
    setAskOpen(false)
    setImportOpen(false)
    setWorkspaceView("overview")
    window.history.replaceState(null, "", "#workspace-header")
  }

  const handleOpenSettings = () => {
    setWorkspaceView("settings")
    window.history.replaceState(null, "", "#settings-panel")
  }

  const handleOpenOverview = () => {
    setWorkspaceView("overview")
    window.history.replaceState(null, "", "#workspace-header")
  }

  const handleOpenTeam = () => {
    setWorkspaceView("team")
    window.history.replaceState(null, "", "#team-panel")
  }

  const handleOpenActivity = () => {
    setWorkspaceView("activity")
    window.history.replaceState(null, "", "#activity-history")
  }

  const handleNewTask = () => {
    if (workspaceView !== "board") handleOpenOverview()
    setQuickAddRequest(request => request + 1)
  }

  useEffect(() => {
    if (currentWorkspace && workspaceView === "settings" && !isCurrentWorkspaceOwner) {
      setWorkspaceView("overview")
      window.history.replaceState(null, "", "#workspace-header")
    }
  }, [currentWorkspace, workspaceView, isCurrentWorkspaceOwner])

  const handleOpenBoard = useCallback(() => {
    setTaskToOpen(null)
    setWorkspaceView("board")
    window.history.replaceState(null, "", "#project-board")
  }, [])

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        handleOpenBoard()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault()
        setSidebarOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", handleKeyboardShortcut)
    return () => window.removeEventListener("keydown", handleKeyboardShortcut)
  }, [handleOpenBoard])

  const handleOpenTask = (taskId: string) => {
    setTaskToOpen(taskId)
    setWorkspaceView("board")
    window.history.replaceState(null, "", "#project-board")
  }

  const handleLogout = async () => {
    if (loggingOut) return

    setLoggingOut(true)
    setLogoutError(null)
    try {
      const result = await logout()
      if (result.error) {
        setLogoutError(result.error)
        return
      }

      window.localStorage.setItem("auth-change", Date.now().toString())
      router.replace("/login")
    } catch (caughtError) {
      setLogoutError(caughtError instanceof Error ? caughtError.message : "Unable to sign out. Please try again.")
    } finally {
      setLoggingOut(false)
    }
  }

  if (authErrorMessage) return <main className='p-8'><p role='alert'>{authErrorMessage}</p><Button onClick={() => window.location.reload()}>Retry</Button></main>
  if (loading || !user) {
    return <PageLoader label="Loading your workspace..." />
  }

  const dashboardState = getDashboardState({ authenticated: Boolean(user), loading: workspacesLoading, error: workspaceError, workspaceCount: workspaces.length, creating: creatingWorkspace })
  const showWorkspace = dashboardState === "workspace" && Boolean(currentWorkspace)

  return (
    <main className="saathi-shell saathi-dashboard min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <SaathiLogo className="size-8 shrink-0" priority />
          <h1 className="sr-only">Saathi</h1>
          {showWorkspace && <div className="min-w-0 flex-1 sm:max-w-sm"><WorkspaceSwitcher workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} onSelectWorkspace={handleSelectWorkspace} onStartNew={() => setCreatingWorkspace(true)} showCreate={false} /></div>}
          <div className="ml-auto flex items-center gap-2">
            {showWorkspace && <Button onClick={handleNewTask}><Plus className="size-4" /><span>New task</span></Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" className="px-2" aria-label="Profile menu"><Avatar className="size-8"><AvatarFallback>{user.username.charAt(0).toUpperCase()}</AvatarFallback></Avatar><ChevronDown className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel><span className="block">{user.username}</span><span className="block text-xs font-normal text-muted-foreground">{user.email}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts"><Keyboard className="size-4" />Keyboard shortcuts</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSidebarOpen(open => !open)} className="hidden lg:flex"><PanelLeft className="size-4" />{sidebarOpen ? "Hide navigation" : "Show navigation"}</DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/guide"><CircleHelp className="size-4" />Help and guide</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/archive"><Archive className="size-4" />Archived workspaces</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleLogout()} disabled={loggingOut} aria-label="Logout" aria-busy={loggingOut}><LogOut className="size-4" />{loggingOut ? "Signing out..." : "Logout"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Use these shortcuts to move around Saathi faster.</DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border rounded-lg border border-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span>Open task board</span>
              <kbd className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">{isMac ? "⌘ K" : "Ctrl K"}</kbd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span>Toggle sidebar</span>
              <kbd className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">{isMac ? "⌘ B" : "Ctrl B"}</kbd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span>Close an open dialog</span>
              <kbd className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">Esc</kbd>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {logoutError && <div className="mx-auto max-w-[1240px] px-4 pt-4 sm:px-6 lg:px-8"><div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{logoutError}. Please try again.</div></div>}
      <div className="lg:hidden"><DashboardNavigation mode="mobile" hasWorkspace={showWorkspace} activeView={workspaceView} onOpenBoard={handleOpenBoard} onOpenOverview={handleOpenOverview} onOpenTeam={handleOpenTeam} /></div>
      <div className="flex min-h-[calc(100vh-4rem)]">
        {sidebarOpen && <aside className="hidden w-56 shrink-0 border-r border-border bg-card px-3 py-5 lg:flex lg:flex-col">
          <div className="mb-5 px-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Workspace</div>
          <DashboardNavigation mode="rail" hasWorkspace={showWorkspace} activeView={workspaceView} onOpenBoard={handleOpenBoard} onOpenOverview={handleOpenOverview} onOpenTeam={handleOpenTeam} />
        </aside>}

        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
            <InvitationNotifications userEmail={user.email} onInvitationAccepted={refreshWorkspaces} />

            {dashboardState === "workspace-loading" ? <PageLoader label="Loading your workspaces..." /> : workspaceError ? (
              <section className="rounded-[var(--saathi-radius-container)] border border-border bg-card p-8 text-center" role="alert">
                <h2 className="text-xl font-semibold">Workspace unavailable</h2>
                <p className="mt-2 text-sm text-muted-foreground">{workspaceError}. Your data was not changed.</p>
                <Button onClick={() => void refreshWorkspaces()} variant="outline" className="mt-5"><RefreshCw className="size-4" />Try again</Button>
              </section>
            ) : !showWorkspace ? (
              <WorkspaceCreateForm
                key={creatingWorkspace ? "new" : "first"}
                aiEnabled={aiWorkspaceEnabled}
                canCancel={workspaces.length > 0}
                onCancel={() => setCreatingWorkspace(false)}
                onCreate={handleCreateWorkspace}
                onSuggest={generateWorkspaceDraft}
                onApprove={handleApprovePlan}
              />
            ) : currentWorkspace ? (
              <>
                <section id="workspace-header" className="mb-4 flex scroll-mt-24 flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3"><h2 className="truncate text-xl font-semibold">{currentWorkspace.name}</h2><Badge variant="outline"><span className={"mr-1.5 size-2 rounded-full " + (realtime.isConnected ? "bg-[var(--saathi-success)]" : "bg-muted-foreground")} />{realtime.isConnected ? "Live" : "Offline"}</Badge></div>
                  <div className="flex items-center gap-2">
                    {aiWorkspaceEnabled && <Button variant="ghost" size="sm" onClick={() => setAskOpen(true)}><Sparkles className="size-4" />Ask Saathi</Button>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Workspace menu" className={workspaceView === "activity" || workspaceView === "settings" ? "border-primary text-primary" : ""}>Workspace<ChevronDown className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setCreatingWorkspace(true)}><Plus className="size-4" />New workspace</DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleOpenActivity} aria-current={workspaceView === "activity" ? "page" : undefined}><History className="size-4" />Activity</DropdownMenuItem>
                        {isCurrentWorkspaceOwner && <DropdownMenuItem onSelect={handleOpenSettings} aria-current={workspaceView === "settings" ? "page" : undefined}><Settings className="size-4" />Settings</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </section>

                {aiWorkspaceEnabled && <Dialog open={askOpen} onOpenChange={setAskOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Ask Saathi</DialogTitle><DialogDescription>Get help with this workspace. Review any proposed changes before confirming.</DialogDescription></DialogHeader><WorkspaceAdvisor key={currentWorkspace.id} workspaceId={currentWorkspace.id} timeZone={currentWorkspace.timezone} onConfirmDraft={async (draft, idempotencyKey) => { const result = await confirmWorkspaceAdvisorDraft(currentWorkspace.id, draft, idempotencyKey); if (!result.error) { setBoardRefreshRequest(value => value + 1); await refreshTasks() } return result }} /></DialogContent></Dialog>}
                {capabilities.csvImport && <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent><DialogHeader><DialogTitle>Import tasks</DialogTitle><DialogDescription>Choose a CSV file with task titles and optional details.</DialogDescription></DialogHeader><TaskImport key={currentWorkspace.id} workspaceId={currentWorkspace.id} onImported={async () => { setBoardRefreshRequest(value => value + 1); await refreshTasks() }} /></DialogContent></Dialog>}

                {realtime.error && (
                  <div role="status" className="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--saathi-warning)]/40 bg-[var(--saathi-warning)]/10 px-4 py-3 text-sm text-[#8a4b00] sm:flex-row sm:items-center sm:justify-between">
                    <span>Updates are paused. Reconnect to continue.</span>
                    <Button onClick={realtime.connect} variant="outline" size="sm" className="w-fit bg-card"><RefreshCw className="size-4" />Reconnect</Button>
                  </div>
                )}

                {workspaceView === "activity" ? (
                  <Card id="activity-history" className="overflow-hidden rounded-[var(--saathi-radius-container)]"><CardHeader className="border-b border-border bg-secondary/25 py-6"><p className="saathi-label text-primary">Workspace record</p><CardTitle className="text-2xl tracking-[-0.04em]">Activity</CardTitle><CardDescription>See changes made in this workspace.</CardDescription></CardHeader><CardContent className="p-5 sm:p-7"><ActivityHistory workspaceId={currentWorkspace.id} refreshSignal={realtime.eventRevision} /></CardContent></Card>
                ) : workspaceView === "settings" && isCurrentWorkspaceOwner ? (
                  <section id="settings-panel"><WorkspaceSettings key={currentWorkspace.id} workspace={currentWorkspace} onSaved={refreshWorkspaces} onArchived={handleArchiveWorkspace} onDeleted={handleDeleteWorkspace} /></section>
                ) : workspaceView === "team" ? (
                  <Card id="team-panel" className="overflow-hidden rounded-[var(--saathi-radius-container)]"><CardHeader className="border-b border-border bg-secondary/25 py-6"><p className="saathi-label text-primary">Team</p><CardTitle className="text-2xl tracking-[-0.04em]">Team members</CardTitle><CardDescription>Invite people and manage access to this workspace.</CardDescription></CardHeader><CardContent className="p-5 sm:p-7"><MemberManager key={currentWorkspace.id} workspaceId={currentWorkspace.id} members={currentWorkspace.members} currentUserEmail={user.email} workspaceOwnerId={currentWorkspace.ownerId} onAddMember={addMember} onRemoveMember={removeMember} onTransferOwnership={handleTransferOwnership} /></CardContent></Card>
                ) : workspaceView === "overview" || workspaceView === "settings" ? (
                  <>
                  {taskError && (
                    <section className="rounded-xl border border-border bg-card p-8 text-center" role="alert">
                      <p className="font-medium">Tasks unavailable</p><p className="mt-2 text-sm text-muted-foreground">{taskError}</p>
                      <Button onClick={() => void refreshTasks()} variant="outline" className="mt-4"><RefreshCw className="size-4" />Try again</Button>
                    </section>
                  )}
                    <WorkspaceOverview
                      key={currentWorkspace.id}
                      workspace={currentWorkspace}
                      currentUserEmail={user.email}
                      tasks={tasks}
                      loading={tasksLoading}
                      onToggleTask={handleToggleTask}
                      onOpenTask={handleOpenTask}
                      onAddTask={handleAddTask}
                      onOpenBoard={handleOpenBoard}
                      onReviewBoard={async () => { if (!await refreshTasks()) throw new Error("Tasks unavailable") }}
                      focusQuickAdd={quickAddRequest}
                    />
                  </>
                ) : (
                  <section className="min-w-0">
                    <Card id="project-board" className="overflow-hidden rounded-[var(--saathi-radius-container)]">
                        <CardHeader className="border-b border-border px-4 py-3">
                          <div className="flex items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-lg"><LayoutGrid className="size-4 text-primary" />Board</CardTitle>
                            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Board actions"><MoreHorizontal className="size-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setBoardRefreshRequest(value => value + 1)}><RefreshCw className="size-4" />Refresh tasks</DropdownMenuItem>{capabilities.csvImport && <DropdownMenuItem onSelect={() => setImportOpen(true)}>Import CSV</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          <WorkspaceBoard key={currentWorkspace.id} workspace={currentWorkspace} currentUserEmail={user.email} refreshSignal={realtime.eventRevision + boardRefreshRequest} openTaskId={taskToOpen} commentRefreshEvent={realtime.lastEvent} onAddTask={handleAddTask} focusQuickAdd={quickAddRequest} />
                        </CardContent>
                    </Card>
                  </section>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
