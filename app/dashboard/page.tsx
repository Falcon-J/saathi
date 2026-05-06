"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  Command,
  Crown,
  LogOut,
  RefreshCw,
  Users,
} from "lucide-react"
import { getSession, logout } from "@/lib/auth-simple"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useNotifications } from "@/hooks/use-notifications"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { WorkspaceNameInlineEditor } from "@/components/workspace-name-inline-editor"
import { TaskList } from "@/components/task-list"
import { MemberManager } from "@/components/member-manager"
import { InvitationNotifications } from "@/components/invitation-notifications"
import { NotificationCenter } from "@/components/notification-center"
import { SaathiLogo } from "@/components/saathi-logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

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
    assignTask,
    addMember,
    removeMember,
    refreshWorkspaces,
    realtime,
  } = useWorkspaces(user?.email && !loading ? user.email : undefined)

  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId)

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
      success("Task created", `"${title}" is now in this workspace.`)
      return result
    } catch (caughtError) {
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
      error("Failed to create task", "Please try again or check your connection.")
      throw caughtError
    }
  }

  const handleToggleTask = async (id: string) => {
    try {
      const task = tasks.find((item) => item.id === id)
      const result = await toggleTask(id)
      const status = task?.completed ? "reopened" : "completed"
      success(`Task ${status}`, task ? `"${task.title}" has been ${status}.` : "Task status updated.")
      return result
    } catch (caughtError) {
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
      error("Failed to update task", "Please try again or check your connection.")
      throw caughtError
    }
  }

  const handleEditTask = async (id: string, updates: any) => {
    try {
      const result = await editTask(id, updates)
      success("Task updated", "The task details are current.")
      return result
    } catch (caughtError) {
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
      error("Failed to update task", "Please try again or check your connection.")
      throw caughtError
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      const task = tasks.find((item) => item.id === id)
      const result = await deleteTask(id)
      success("Task deleted", task ? `"${task.title}" has been deleted.` : "Task has been deleted.")
      return result
    } catch (caughtError) {
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
      error("Failed to delete task", "Please try again or check your connection.")
      throw caughtError
    }
  }

  const handleAssignTask = async (id: string, assigneeEmail: string | null) => {
    try {
      const result = await assignTask(id, assigneeEmail || "")
      const task = tasks.find((item) => item.id === id)
      const assignee = assigneeEmail
        ? currentWorkspace?.members.find((member) => member.email === assigneeEmail)?.username || assigneeEmail
        : "Unassigned"
      success("Task assigned", task ? `"${task.title}" assigned to ${assignee}.` : "Task assignment updated.")
      return result
    } catch (caughtError) {
      const authHandled = await handleAuthError(caughtError)
      if (authHandled) return { error: "Authentication required" }
      error("Failed to assign task", "Please try again or check your connection.")
      throw caughtError
    }
  }

  const handleLogout = async () => {
    await logout()
    info("Logged out", "You have been signed out.")
    router.push("/login")
  }

  if (loading || !user) {
    return (
      <main className="saathi-shell flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 size-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading Saathi workspace...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="saathi-shell min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <SaathiLogo className="size-10" priority />
            <div>
              <h1 className="text-xl font-bold leading-none">Saathi</h1>
              <p className="saathi-label mt-1 text-muted-foreground">Collaborative task manager</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-2 md:flex">
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
            <NotificationCenter />
            <Button onClick={handleLogout} variant="outline" size="sm">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <InvitationNotifications userEmail={user.email} onInvitationAccepted={refreshWorkspaces} />

        <section className="mb-6">
          <div className="saathi-panel rounded-2xl p-5">
            <div className="mb-5 flex flex-col gap-4 border-b border-border/70 pb-5 md:flex-row md:items-center md:justify-between">
              <div>
                {currentWorkspace ? (
                  <WorkspaceNameInlineEditor
                    workspaceId={currentWorkspace.id}
                    currentName={currentWorkspace.name}
                    isOwner={currentWorkspace.ownerId === user.email}
                    onNameUpdated={refreshWorkspaces}
                    className="text-3xl font-bold leading-tight"
                  />
                ) : (
                  <h2 className="text-3xl font-bold leading-tight">Create your first workspace</h2>
                )}
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  A focused board for tasks, ownership, and team access.
                </p>
              </div>

              {currentWorkspace && (
                <div className="min-w-[180px] rounded-xl border border-white/10 bg-background/35 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="saathi-label text-muted-foreground">Completion</span>
                    <span className="text-sm text-primary">{metrics.completion}%</span>
                  </div>
                  <Progress value={metrics.completion} className="h-2" />
                </div>
              )}
            </div>

            <WorkspaceSwitcher
              workspaces={workspaces}
              currentWorkspaceId={currentWorkspaceId}
              onSelectWorkspace={setCurrentWorkspaceId}
              onCreateWorkspace={createWorkspace}
              currentUserEmail={user.email}
              onWorkspaceUpdated={refreshWorkspaces}
            />
          </div>
        </section>

        {currentWorkspace ? (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <Card className="saathi-panel overflow-hidden rounded-2xl border-white/10">
                <CardHeader className="border-b border-white/10 bg-transparent">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Command className="size-5 text-primary" />
                        Project Board
                      </CardTitle>
                      <CardDescription>{metrics.active} active, {metrics.completed} completed.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-fit border-white/10 bg-transparent text-muted-foreground">
                        <span className={`mr-1.5 size-2 rounded-full ${realtime.isConnected ? "bg-primary" : "bg-muted-foreground"}`} />
                        {realtime.isConnected ? "Live" : "Offline"}
                      </Badge>
                      {currentWorkspace.ownerId === user.email && (
                        <Badge className="w-fit border-primary/30 bg-primary/10 text-primary">
                          <Crown className="mr-1 size-3" />
                          Owner
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <TaskList
                    tasks={tasks}
                    loading={false}
                    members={currentWorkspace.members}
                    currentUserEmail={user.email}
                    workspaceOwnerId={currentWorkspace.ownerId}
                    onAddTask={handleAddTask}
                    onToggleTask={handleToggleTask}
                    onDeleteTask={handleDeleteTask}
                    onEditTask={handleEditTask}
                    onAssignTask={handleAssignTask}
                  />
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-6">
              <Card className="saathi-panel rounded-2xl border-white/10">
                <CardHeader className="border-b border-white/10">
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

              <Card className="saathi-panel rounded-2xl border-white/10">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="size-5 text-primary" />
                    Realtime
                  </CardTitle>
                  <CardDescription>One persistent stream for this workspace.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium text-primary">{realtime.isConnected ? "Connected" : "Waiting"}</span>
                  </div>
                  {realtime.error && (
                    <Button onClick={realtime.connect} variant="outline" className="w-full">
                      <RefreshCw className="size-4" />
                      Reconnect
                    </Button>
                  )}
                </CardContent>
              </Card>
            </aside>
          </section>
        ) : (
          <section className="saathi-panel rounded-xl p-10 text-center">
            <SaathiLogo className="mx-auto mb-5 size-16" />
            <h2 className="text-3xl font-bold">Start with a workspace</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              A workspace gives your team a shared board, member list, permissions, and realtime activity stream.
            </p>
            <Button onClick={() => createWorkspace("Launch Workspace")} className="mt-6" size="lg">
              Create workspace
            </Button>
          </section>
        )}
      </div>
    </main>
  )
}
