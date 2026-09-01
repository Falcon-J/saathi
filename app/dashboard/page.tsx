"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  Crown,
  LogOut,
  LayoutGrid,
  RefreshCw,
  Users,
} from "lucide-react"
import { getSession, logout } from "@/lib/auth-simple"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useNotifications } from "@/hooks/use-notifications"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { WorkspaceNameInlineEditor } from "@/components/workspace-name-inline-editor"
import { TaskList } from "@/components/task-list"
import { TaskImport } from "@/components/task-import"
import { MemberManager } from "@/components/member-manager"
import { InvitationNotifications } from "@/components/invitation-notifications"
import { UsageSummary } from "@/components/usage-summary"
import { DashboardNavigation } from "@/components/dashboard-navigation"
import { SaathiLogo } from "@/components/saathi-logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { normalizeEmail } from "@/lib/identity"
import { getMutationError, getThrownErrorMessage } from "@/lib/mutation-result"
import type { TaskUpdate } from "@/app/tasks/contract"

type SessionUser = {
  email: string
  username: string
}

export default function Dashboard() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
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
        const hasShownWelcome = sessionStorage.getItem(welcomeKey)
        if (!hasShownWelcome && !welcomeShownRef.current) {
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

    checkAuth()
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "auth-change") {
        checkAuth()
      }
    }

    window.addEventListener("storage", handleStorageChange)
    return () => {
      window.removeEventListener("storage", handleStorageChange)
    }
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
    const active = tasks.length - completed
    const highPriority = tasks.filter((task) => task.priority === "high" && !task.completed).length
    const completion = Math.round((completed / Math.max(tasks.length, 1)) * 100)

    return { completed, active, highPriority, completion }
  }, [tasks])

  const handleAuthError = async (caughtError: any) => {
    if (caughtError?.message?.includes("Authentication") || caughtError?.name === "AuthenticationError") {
      error("Session expired", "Please sign in again to continue.")
      router.push("/login")
      return true
    }
    return false
  }

  const handleAddTask = async (
    title: string,
    description?: string,
    priority?: "low" | "medium" | "high",
    dueDate?: string,
  ) => {
    try {
      const result = await addTask(title, description, priority, dueDate)
      const mutationError = getMutationError(result)
      if (mutationError) {
        error("Failed to create task", mutationError)
        return result
      }
      success("Task created", `"${title}" is now in this workspace.`)
      return result
    } catch (caughtError) {
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
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
      success(`Task ${status}`, task ? `"${task.title}" has been ${status}.` : "Task status updated.")
      return result
    } catch (caughtError) {
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
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
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
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
      success("Task deleted", task ? `"${task.title}" has been deleted.` : "Task has been deleted.")
      return result
    } catch (caughtError) {
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
      const message = getThrownErrorMessage(caughtError, "Unable to delete task. Please try again.")
      error("Failed to delete task", message)
      return { error: message }
    }
  }

  const handleLogout = async () => {
    await logout()
    window.localStorage.setItem("auth-change", Date.now().toString())
    info("Logged out", "You have been signed out.")
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

  return (
    <main className="saathi-shell saathi-dashboard min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <SaathiLogo className="size-9" priority />
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold leading-none tracking-tight">Saathi</h1>
              <p className="mt-1 text-xs font-medium text-muted-foreground">Collaborative workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-1.5 md:flex">
              <Avatar className="size-8 border border-primary/30">
                <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                  {user.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-right">
                <p className="text-sm font-semibold leading-none">{user.username}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <Button onClick={handleLogout} variant="outline" size="sm" className="rounded-lg">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="lg:hidden">
        <DashboardNavigation mode="mobile" hasWorkspace={Boolean(currentWorkspace)} />
      </div>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden w-20 shrink-0 border-r border-border bg-card px-3 py-5 lg:flex lg:flex-col lg:items-center">
          <DashboardNavigation mode="rail" hasWorkspace={Boolean(currentWorkspace)} />
          <div className="mt-auto flex flex-col items-center gap-3">
            <Avatar className="size-9 border border-border">
              <AvatarFallback className="bg-secondary text-sm font-semibold text-foreground">
                {user.username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
            <InvitationNotifications userEmail={user.email} onInvitationAccepted={refreshWorkspaces} />

            {workspaceError ? (
              <section className="saathi-panel mb-6 rounded-[var(--saathi-radius-container)] p-8" role="alert">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
                <RefreshCw className="size-6" />
              </div>
              <h2 className="text-2xl font-bold">Workspace unavailable</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {workspaceError}. Your workspace data was not changed.
              </p>
              <Button onClick={() => void refreshWorkspaces()} variant="outline" className="mt-5">
                <RefreshCw className="size-4" />
                Try again
              </Button>
            </div>
              </section>
            ) : (
              <section id="workspace-header" className="mb-6 scroll-mt-32">
                <div className="saathi-panel rounded-[var(--saathi-radius-card)] p-5 sm:p-6">
                  <div className="mb-5 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
                <div>
                  {currentWorkspace ? (
                    <WorkspaceNameInlineEditor
                      workspaceId={currentWorkspace.id}
                      currentName={currentWorkspace.name}
                      isOwner={isCurrentWorkspaceOwner}
                      onNameUpdated={refreshWorkspaces}
                      className="text-[var(--saathi-type-page-title)] font-bold leading-tight"
                    />
                  ) : (
                    <h2 className="text-[var(--saathi-type-page-title)] font-bold leading-tight">Create your first workspace</h2>
                  )}
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    A focused board for tasks, ownership, and team access.
                  </p>
                </div>

                {currentWorkspace && (
                  <div className="min-w-[180px] rounded-xl border border-border bg-secondary/60 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="saathi-label text-muted-foreground">Completion</span>
                      <span className="text-sm text-primary">{metrics.completion}%</span>
                    </div>
                    <Progress value={metrics.completion} className="h-2" />
                  </div>
                )}
              </div>

              <div id="workspace-switcher">
                <WorkspaceSwitcher
                  workspaces={workspaces}
                  currentWorkspaceId={currentWorkspaceId}
                  onSelectWorkspace={setCurrentWorkspaceId}
                  onCreateWorkspace={createWorkspace}
                />
              </div>
                </div>
              </section>
            )}

            {workspaceError ? null : currentWorkspace ? (
              <section className="grid items-start gap-4 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-9">
              <Card id="project-board" className="saathi-panel scroll-mt-32 overflow-hidden rounded-[var(--saathi-radius-container)]">
                <CardHeader className="border-b border-border bg-transparent">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <LayoutGrid className="size-5 text-primary" />
                        Project Board
                      </CardTitle>
                      <CardDescription>{metrics.active} active, {metrics.completed} completed.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskImport workspaceId={currentWorkspace.id} onImported={refreshTasks} />
                      <Badge variant="outline" className="w-fit border-border bg-card text-muted-foreground">
                        <span className={`mr-1.5 size-2 rounded-full ${realtime.isConnected ? "bg-[var(--saathi-success)]" : "bg-muted-foreground"}`} />
                        {realtime.isConnected ? "Live" : "Offline"}
                      </Badge>
                      {isCurrentWorkspaceOwner && (
                        <Badge className="w-fit border-primary/30 bg-primary/10 text-primary">
                          <Crown className="mr-1 size-3" />
                          Owner
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {taskError ? (
                    <div className="p-8 text-center" role="alert">
                      <p className="font-medium">Tasks unavailable</p>
                      <p className="mt-2 text-sm text-muted-foreground">{taskError}</p>
                      <Button onClick={() => void refreshTasks()} variant="outline" className="mt-4">
                        <RefreshCw className="size-4" />
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <TaskList
                      tasks={tasks}
                      loading={tasksLoading}
                      members={currentWorkspace.members}
                      currentUserEmail={user.email}
                      workspaceOwnerId={currentWorkspace.ownerId}
                      onAddTask={handleAddTask}
                      onToggleTask={handleToggleTask}
                      onDeleteTask={handleDeleteTask}
                      onEditTask={handleEditTask}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-4 xl:col-span-3">
              <Card id="team-panel" className="saathi-panel scroll-mt-32 rounded-[var(--saathi-radius-card)]">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="size-5 text-primary" />
                    Team
                  </CardTitle>
                  <CardDescription>{currentWorkspace.members.length} member{currentWorkspace.members.length === 1 ? "" : "s"}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <MemberManager
                    members={currentWorkspace.members}
                    currentUserEmail={user.email}
                    workspaceOwnerId={currentWorkspace.ownerId}
                    onAddMember={addMember}
                    onRemoveMember={removeMember}
                  />
                </CardContent>
              </Card>

              <Card id="realtime-panel" className="saathi-panel scroll-mt-32 rounded-[var(--saathi-radius-card)]">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="size-5 text-primary" />
                    Realtime
                  </CardTitle>
                  <CardDescription>One persistent stream for this workspace.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">Status</span>
                    <span className={`font-medium ${realtime.isConnected ? "text-[var(--saathi-success)]" : "text-muted-foreground"}`}>
                      {realtime.isConnected ? "Live" : "Offline"}
                    </span>
                  </div>
                  {realtime.error && (
                    <div className="space-y-3">
                      <p className="text-xs leading-5 text-muted-foreground">{realtime.error}</p>
                      <Button onClick={realtime.connect} variant="outline" className="w-full">
                        <RefreshCw className="size-4" />
                        Reconnect
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <UsageSummary
                workspaceId={currentWorkspace.id}
                refreshToken={`${tasks.length}:${tasks.filter((task) => task.completed).length}:${currentWorkspace.members.length}`}
              />
            </aside>
              </section>
            ) : (
              <section className="saathi-panel rounded-[var(--saathi-radius-container)] p-10 text-center">
            <SaathiLogo className="mx-auto mb-5 size-16" />
            <h2 className="text-[var(--saathi-type-page-title)] font-bold">Start with a workspace</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              A workspace gives your team a shared board, member list, permissions, and realtime activity stream.
            </p>
            <Button onClick={() => createWorkspace("Launch Workspace")} className="mt-6" size="lg">
              Create workspace
            </Button>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
