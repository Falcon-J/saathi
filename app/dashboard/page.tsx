"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, CircleHelp, Crown, LayoutGrid, ListChecks, LogOut, RefreshCw, Users } from "lucide-react"
import { applyNaturalLanguageCommand, generateWorkspaceFromIntent } from "@/app/actions/workspace-intent"
import type { TaskUpdate } from "@/app/tasks/contract"
import { DashboardNavigation } from "@/components/dashboard-navigation"
import { InvitationNotifications } from "@/components/invitation-notifications"
import { MemberManager } from "@/components/member-manager"
import { SaathiLogo } from "@/components/saathi-logo"
import { TaskImport } from "@/components/task-import"
import { TaskList } from "@/components/task-list"
import { UsageSummary } from "@/components/usage-summary"
import { WorkspaceCommandBar } from "@/components/workspace-command-bar"
import { WorkspaceCreateForm } from "@/components/workspace-create-form"
import { WorkspaceNameInlineEditor } from "@/components/workspace-name-inline-editor"
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
type WorkspaceView = "overview" | "board"

const aiWorkspaceEnabled = isAiWorkspaceEnabled()

export default function Dashboard() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("overview")
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
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
        console.error("Dashboard auth check failed:", authError)
        router.replace("/login")
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

  const handleCreateWorkspace = async (value: string) => {
    if (aiWorkspaceEnabled) {
      const result = await generateWorkspaceFromIntent(value)
      if (result.error || !result.workspace) return { error: result.error ?? "Unable to create the workspace." }
      await refreshWorkspaces()
      setCurrentWorkspaceId(result.workspace.id)
    } else {
      const workspace = await createWorkspace(value)
      if (!workspace) return { error: "Unable to create the workspace." }
      setCurrentWorkspaceId(workspace.id)
    }
    setCreatingWorkspace(false)
    setWorkspaceView("overview")
    return {}
  }

  const handleCommand = async (command: string) => {
    if (!currentWorkspaceId) return { error: "Select a workspace first." }
    const result = await applyNaturalLanguageCommand(currentWorkspaceId, command)
    if (!result.error) {
      await Promise.all([refreshTasks(), refreshWorkspaces()])
    }
    return result
  }

  const handleSelectWorkspace = (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId)
    setCreatingWorkspace(false)
    setWorkspaceView("overview")
  }

  const handleLogout = async () => {
    await logout()
    window.localStorage.setItem("auth-change", Date.now().toString())
    router.push("/login")
  }

  if (loading || !user) {
    return (
      <main className="saathi-shell saathi-dashboard flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 size-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading Saathi workspace...</p>
        </div>
      </main>
    )
  }

  const showWorkspace = Boolean(currentWorkspace) && !creatingWorkspace

  return (
    <main className="saathi-shell saathi-dashboard min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <SaathiLogo className="size-9" priority />
            <div>
              <h1 className="text-lg font-semibold leading-none tracking-tight">Saathi</h1>
              <p className="mt-1 hidden text-xs text-muted-foreground sm:block">Move from intention to action</p>
            </div>
          </div>
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
            <Button onClick={handleLogout} variant="outline" size="sm" aria-label="Logout"><LogOut className="size-4" /><span className="hidden sm:inline">Logout</span></Button>
          </div>
        </div>
      </header>

      <div className="lg:hidden"><DashboardNavigation mode="mobile" hasWorkspace={showWorkspace} showSecondary={workspaceView === "board"} /></div>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden w-20 shrink-0 border-r border-border bg-card px-3 py-5 lg:flex lg:flex-col lg:items-center">
          <DashboardNavigation mode="rail" hasWorkspace={showWorkspace} showSecondary={workspaceView === "board"} />
          <Avatar className="mt-auto size-9 border border-border"><AvatarFallback className="bg-secondary text-sm font-semibold">{user.username.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
            <InvitationNotifications userEmail={user.email} onInvitationAccepted={refreshWorkspaces} />

            {workspaceError ? (
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
              />
            ) : currentWorkspace ? (
              <>
                <section id="workspace-header" className="mb-5 scroll-mt-32 rounded-[var(--saathi-radius-card)] border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <WorkspaceSwitcher workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} onSelectWorkspace={handleSelectWorkspace} onStartNew={() => setCreatingWorkspace(true)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex rounded-lg bg-secondary p-1" aria-label="Workspace view">
                        <Button type="button" size="sm" variant={workspaceView === "overview" ? "default" : "ghost"} onClick={() => setWorkspaceView("overview")}><ListChecks className="size-4" />Overview</Button>
                        <Button type="button" size="sm" variant={workspaceView === "board" ? "default" : "ghost"} onClick={() => setWorkspaceView("board")}><LayoutGrid className="size-4" />Board</Button>
                      </div>
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

                {workspaceView === "overview" ? (
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
                      onAddTask={(title) => handleAddTask(title, undefined, "medium", undefined, "today")}
                      onEditTask={handleEditTask}
                      onDeleteTask={handleDeleteTask}
                      onOpenBoard={() => setWorkspaceView("board")}
                      title={
                        <WorkspaceNameInlineEditor
                          workspaceId={currentWorkspace.id}
                          currentName={currentWorkspace.name}
                          isOwner={Boolean(isCurrentWorkspaceOwner)}
                          onNameUpdated={refreshWorkspaces}
                        />
                      }
                      commandBar={aiWorkspaceEnabled ? <WorkspaceCommandBar onCommand={handleCommand} /> : undefined}
                    />
                  )
                ) : (
                  <section className="grid items-start gap-4 xl:grid-cols-12">
                    <div className="min-w-0 xl:col-span-9">
                      <Card id="project-board" className="scroll-mt-32 overflow-hidden rounded-[var(--saathi-radius-container)]">
                        <CardHeader className="border-b border-border">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div><CardTitle className="flex items-center gap-2 text-xl"><LayoutGrid className="size-5 text-primary" />Project Board</CardTitle><CardDescription>{metrics.active} active, {metrics.completed} completed.</CardDescription></div>
                            <TaskImport workspaceId={currentWorkspace.id} onImported={refreshTasks} />
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          {taskError ? (
                            <div className="p-8 text-center" role="alert"><p className="font-medium">Tasks unavailable</p><p className="mt-2 text-sm text-muted-foreground">{taskError}</p><Button onClick={() => void refreshTasks()} variant="outline" className="mt-4">Try again</Button></div>
                          ) : (
                            <TaskList tasks={tasks} loading={tasksLoading} members={currentWorkspace.members} currentUserEmail={user.email} workspaceOwnerId={currentWorkspace.ownerId} onAddTask={handleAddTask} onToggleTask={handleToggleTask} onDeleteTask={handleDeleteTask} onEditTask={handleEditTask} />
                          )}
                        </CardContent>
                      </Card>
                    </div>
                    <aside className="space-y-4 xl:col-span-3">
                      <Card id="team-panel" className="scroll-mt-32"><CardHeader className="border-b border-border"><CardTitle className="flex items-center gap-2 text-lg"><Users className="size-5 text-primary" />Team</CardTitle><CardDescription>{currentWorkspace.members.length} member{currentWorkspace.members.length === 1 ? "" : "s"}</CardDescription></CardHeader><CardContent className="p-0"><MemberManager members={currentWorkspace.members} currentUserEmail={user.email} workspaceOwnerId={currentWorkspace.ownerId} onAddMember={addMember} onRemoveMember={removeMember} /></CardContent></Card>
                      <Card id="realtime-panel" className="scroll-mt-32"><CardHeader className="border-b border-border"><CardTitle className="flex items-center gap-2 text-lg"><Activity className="size-5 text-primary" />Connection</CardTitle><CardDescription>Workspace updates and recovery.</CardDescription></CardHeader><CardContent className="space-y-4 pt-4 text-sm"><div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2"><span className="text-muted-foreground">Status</span><span className={realtime.isConnected ? "text-[var(--saathi-success)]" : "text-muted-foreground"}>{realtime.isConnected ? "Live" : "Offline"}</span></div><div><p className="font-medium">{realtime.activeUsers.length} active now</p><div className="mt-2 flex flex-wrap gap-1.5" aria-label="Active workspace members">{realtime.activeUsers.length > 0 ? realtime.activeUsers.map((email) => <Badge key={email} variant="secondary" title={email}>{email === user.email ? "You" : email.split("@")[0]}</Badge>) : <span className="text-xs text-muted-foreground">No other members are online.</span>}</div></div></CardContent></Card>
                      <UsageSummary workspaceId={currentWorkspace.id} refreshToken={`${tasks.length}:${metrics.completed}:${currentWorkspace.members.length}`} />
                    </aside>
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
