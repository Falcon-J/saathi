"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleHelp, Crown, LayoutGrid, LogOut, Plus, RefreshCw, UserPlus } from "lucide-react"
import { generateWorkspaceDraft, createWorkspaceFromPlan } from "@/app/actions/workspace-intent"
import { archiveWorkspace, deleteWorkspace, transferWorkspaceOwnership } from "@/app/actions/workspaces"
import type { TaskUpdate } from "@/app/tasks/contract"
import { DashboardNavigation } from "@/components/dashboard-navigation"
import { InvitationNotifications } from "@/components/invitation-notifications"
import { MemberManager } from "@/components/member-manager"
import { PageLoader } from "@/components/page-loader"
import { SaathiLogo } from "@/components/saathi-logo"
import { TaskImport } from "@/components/task-import"
import { TaskList } from "@/components/task-list"
import { TimeSensitiveGreeting } from "@/components/time-sensitive-greeting"
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
import { useNotifications } from "@/hooks/use-notifications"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { getSession, logout } from "@/lib/auth-simple"
import { isAiWorkspaceEnabled } from "@/lib/feature-flags"
import { normalizeEmail } from "@/lib/identity"
import { getMutationError, getThrownErrorMessage } from "@/lib/mutation-result"

type SessionUser = { email: string; username: string }
type WorkspaceView = "overview" | "board" | "team" | "settings"

const aiWorkspaceEnabled = isAiWorkspaceEnabled()

function workspaceViewFromHash(hash: string): WorkspaceView {
  if (hash === "#workspace-header") return "overview"
  if (hash === "#team-panel") return "team"
  if (hash === "#settings-panel") return "settings"
  return "board"
}

export default function Dashboard() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => typeof window === "undefined" ? "board" : workspaceViewFromHash(window.location.hash))
  const [quickAddRequest, setQuickAddRequest] = useState(0)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null)
  const welcomeShownRef = useRef(false)
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
  } = useWorkspaces(user?.email && !loading ? user.email : undefined)

  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId)
  const isCurrentWorkspaceOwner = currentWorkspace && user
    ? normalizeEmail(currentWorkspace.ownerId) === normalizeEmail(user.email)
    : false

  const metrics = useMemo(() => {
    const completed = tasks.filter((task) => task.completed).length
    return { completed, active: tasks.length - completed }
  }, [tasks])

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
      return { error: message }
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

  const handleEditTask = async (id: string, updates: TaskUpdate) => {
    try {
      const result = await editTask(id, updates)
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
    setWorkspaceView("board")
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
    setWorkspaceView("board")
  }

  const handleOpenSettings = () => {
    setWorkspaceView("settings")
    window.history.replaceState(null, "", "#settings-panel")
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
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <SaathiLogo className="size-9" priority />
            <h1 className="text-lg font-semibold leading-none tracking-tight">Saathi</h1>
          </div>
          <button
            type="button"
            onClick={() => setWorkspaceView("board")}
            className="hidden h-10 min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-background px-3 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex md:max-w-[31rem]"
            aria-label="Open task board"
          >
            <LayoutGrid className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Open the task board</span>
            <kbd className="ml-auto hidden rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground lg:inline">⌘ K</kbd>
          </button>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <Link href="/guide" aria-label="Open Saathi guide" title="How Saathi works">
                <CircleHelp className="size-5" />
              </Link>
            </Button>
            <div className="hidden items-center gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-1.5 md:flex">
              <Avatar className="size-8 border border-primary/30"><AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{user.username.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
              <div className="text-right"><p className="text-sm font-semibold leading-none">{user.username}</p><p className="mt-1 text-xs text-muted-foreground">{user.email}</p></div>
            </div>
            <Button onClick={handleLogout} variant="outline" size="sm" aria-label="Logout" aria-busy={loggingOut} disabled={loggingOut}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">{loggingOut ? "Signing out..." : "Logout"}</span>
            </Button>
          </div>
        </div>
      </header>

      {logoutError && <div className="mx-auto max-w-[1240px] px-4 pt-4 sm:px-6 lg:px-8"><div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{logoutError}. Please try again.</div></div>}
      <div className="lg:hidden"><DashboardNavigation mode="mobile" hasWorkspace={showWorkspace} activeView={workspaceView} onOpenBoard={() => setWorkspaceView("board")} onOpenOverview={() => setWorkspaceView("overview")} onOpenTeam={() => setWorkspaceView("team")} isOwner={Boolean(isCurrentWorkspaceOwner)} settingsActive={workspaceView === "settings"} onOpenSettings={handleOpenSettings} /></div>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-card px-3 py-5 lg:flex lg:flex-col">
          <div className="mb-5 px-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Workspace</div>
          <DashboardNavigation mode="rail" hasWorkspace={showWorkspace} activeView={workspaceView} onOpenBoard={() => setWorkspaceView("board")} onOpenOverview={() => setWorkspaceView("overview")} onOpenTeam={() => setWorkspaceView("team")} isOwner={Boolean(isCurrentWorkspaceOwner)} settingsActive={workspaceView === "settings"} onOpenSettings={handleOpenSettings} />
          {showWorkspace && (
            <div className="mt-auto rounded-xl border border-border bg-secondary/45 p-3">
              <p className="text-xs font-medium text-muted-foreground">Current workspace</p>
              <p className="mt-1 truncate text-sm font-semibold">{currentWorkspace?.name}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{metrics.active} active tasks</span><span>{metrics.completed} done</span></div>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 border-t border-border px-3 pt-4"><Avatar className="size-9 border border-border"><AvatarFallback className="bg-secondary text-sm font-semibold">{user.username.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.username}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div></div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
            <InvitationNotifications userEmail={user.email} onInvitationAccepted={refreshWorkspaces} />

            {showWorkspace && dashboardState === "workspace" && workspaceView === "overview" && (
              <section className="mb-6 flex flex-col gap-5 rounded-[var(--saathi-radius-container)] border border-border bg-card px-5 py-6 shadow-sm sm:px-7 sm:py-7 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="saathi-label text-primary">{currentWorkspace?.name}</p>
                  <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-4xl"><TimeSensitiveGreeting username={user.username} /></h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">A shared place to turn intention into steady progress.</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:max-w-[30rem] lg:justify-end">
                  <Button onClick={() => { setWorkspaceView("overview"); setQuickAddRequest((request) => request + 1) }}><Plus className="size-4" />New task</Button>
                  <Button variant="outline" onClick={() => setCreatingWorkspace(true)}><Plus className="size-4 text-primary" />New workspace</Button>
                  <Button variant="outline" onClick={() => setWorkspaceView("team")}><UserPlus className="size-4 text-primary" />Invite people</Button>
                </div>
              </section>
            )}

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
                <section id="workspace-header" className="mb-5 scroll-mt-32 rounded-[var(--saathi-radius-card)] border border-border bg-card p-3 shadow-sm sm:p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <WorkspaceSwitcher workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} onSelectWorkspace={handleSelectWorkspace} onStartNew={() => setCreatingWorkspace(true)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-card"><span className={`mr-1.5 size-2 rounded-full ${realtime.isConnected ? "bg-[var(--saathi-success)]" : "bg-muted-foreground"}`} />{realtime.isConnected ? "Live" : "Offline"}</Badge>
                      {isCurrentWorkspaceOwner && <Badge className="border-primary/30 bg-primary/10 text-primary"><Crown className="mr-1 size-3" />Owner</Badge>}
                    </div>
                  </div>
                </section>

                {realtime.error && (
                  <div role="status" className="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--saathi-warning)]/40 bg-[var(--saathi-warning)]/10 px-4 py-3 text-sm text-[#8a4b00] sm:flex-row sm:items-center sm:justify-between">
                    <span>Updates are paused. Reconnect to continue.</span>
                    <Button onClick={realtime.connect} variant="outline" size="sm" className="w-fit bg-card"><RefreshCw className="size-4" />Reconnect</Button>
                  </div>
                )}

                {workspaceView === "settings" && isCurrentWorkspaceOwner ? (
                  <section id="settings-panel"><WorkspaceSettings key={currentWorkspace.id} workspace={currentWorkspace} onSaved={refreshWorkspaces} onArchived={handleArchiveWorkspace} onDeleted={handleDeleteWorkspace} /></section>
                ) : workspaceView === "team" ? (
                  <Card id="team-panel" className="overflow-hidden rounded-[var(--saathi-radius-container)]"><CardHeader className="border-b border-border bg-secondary/25 py-6"><p className="saathi-label text-primary">Team</p><CardTitle className="text-2xl tracking-[-0.04em]">Work better together.</CardTitle><CardDescription>Invite your team, manage members, and keep everyone aligned.</CardDescription></CardHeader><CardContent className="p-5 sm:p-7"><MemberManager key={currentWorkspace.id} workspaceId={currentWorkspace.id} members={currentWorkspace.members} currentUserEmail={user.email} workspaceOwnerId={currentWorkspace.ownerId} onAddMember={addMember} onRemoveMember={removeMember} onTransferOwnership={handleTransferOwnership} /></CardContent></Card>
                ) : workspaceView === "overview" || workspaceView === "settings" ? (
                  taskError ? (
                    <section id="project-board" className="rounded-xl border border-border bg-card p-8 text-center" role="alert">
                      <p className="font-medium">Tasks unavailable</p><p className="mt-2 text-sm text-muted-foreground">{taskError}</p>
                      <Button onClick={() => void refreshTasks()} variant="outline" className="mt-4"><RefreshCw className="size-4" />Try again</Button>
                    </section>
                  ) : (
                    <WorkspaceOverview
                      workspace={currentWorkspace}
                      tasks={tasks}
                      loading={tasksLoading}
                      onToggleTask={handleToggleTask}
                      onAddTask={handleAddTask}
                      onOpenBoard={() => setWorkspaceView("board")}
                      focusQuickAdd={quickAddRequest}
                      title={<span>{currentWorkspace.name}</span>}
                      realtimeSignal={realtime.lastEvent?.timestamp}
                    />
                  )
                ) : (
                  <section className="min-w-0">
                    <Card id="project-board" className="overflow-hidden rounded-[var(--saathi-radius-container)]">
                        <CardHeader className="border-b border-border">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div><CardTitle className="flex items-center gap-2 text-xl"><LayoutGrid className="size-5 text-primary" />Task board</CardTitle><CardDescription>{metrics.active} active, {metrics.completed} completed.</CardDescription></div>
                            <TaskImport workspaceId={currentWorkspace.id} onImported={refreshTasks} />
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          {taskError ? (
                            <div className="p-8 text-center" role="alert"><p className="font-medium">Tasks unavailable</p><p className="mt-2 text-sm text-muted-foreground">{taskError}</p><Button onClick={() => void refreshTasks()} variant="outline" className="mt-4">Try again</Button></div>
                          ) : (
                            <TaskList tasks={tasks} loading={tasksLoading} members={currentWorkspace.members} currentUserEmail={user.email} workspaceOwnerId={currentWorkspace.ownerId} commentRefreshEvent={realtime.lastEvent} onAddTask={handleAddTask} onToggleTask={handleToggleTask} onDeleteTask={handleDeleteTask} onEditTask={handleEditTask} />
                          )}
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
