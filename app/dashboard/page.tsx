"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSession, logout } from "@/lib/auth-simple"
import { useWorkspaces } from "@/hooks/use-workspaces"

import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { TaskList } from "@/components/task-list"
import { MemberManager } from "@/components/member-manager"
import { InvitationNotifications } from "@/components/invitation-notifications"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { LogOut, Users, BarChart3, Calendar, Crown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { WorkspaceNameInlineEditor } from "@/components/workspace-name-inline-editor"


export default function Dashboard() {
  const [user, setUser] = useState<{ email: string; username: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { toast } = useToast()



  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await getSession()
        if (!session) {
          router.replace("/login")
        } else {
          setUser(session)
        }
      } catch (error) {
        console.error("Dashboard auth check failed:", error)
        router.replace("/login")
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [router])

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
  } = useWorkspaces(user?.email && !loading ? user.email : undefined)

  // Collaboration features disabled for now

  // Collaboration notifications disabled

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId)

  const handleAuthError = async (error: any) => {
    if (error?.message?.includes('Authentication') || error?.name === 'AuthenticationError') {
      toast({
        title: "Session expired",
        description: "Please log in again to continue",
        variant: "destructive"
      })
      router.push("/login")
      return true
    }
    return false
  }

  const handleAddTask = async (title: string, description?: string, priority?: 'low' | 'medium' | 'high', dueDate?: string) => {
    try {
      const result = await addTask(title, description, priority, dueDate)
      return result
    } catch (error) {
      const authHandled = await handleAuthError(error)
      if (authHandled) return { error: "Authentication required" }
      throw error
    }
  }

  const handleToggleTask = async (id: string) => {
    try {
      const result = await toggleTask(id)
      return result
    } catch (error) {
      const authHandled = await handleAuthError(error)
      if (authHandled) return { error: "Authentication required" }
      throw error
    }
  }

  const handleEditTask = async (id: string, updates: any) => {
    try {
      const result = await editTask(id, updates)
      return result
    } catch (error) {
      const authHandled = await handleAuthError(error)
      if (authHandled) return { error: "Authentication required" }
      throw error
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      const result = await deleteTask(id)
      return result
    } catch (error) {
      const authHandled = await handleAuthError(error)
      if (authHandled) return { error: "Authentication required" }
      throw error
    }
  }

  const handleAssignTask = async (id: string, assigneeEmail: string | null) => {
    try {
      const result = await assignTask(id, assigneeEmail || "")
      return result
    } catch (error) {
      const authHandled = await handleAuthError(error)
      if (authHandled) return { error: "Authentication required" }
      throw error
    }
  }

  const handleLogout = async () => {
    await logout()
    toast({ title: "Logged out successfully" })
    router.push("/login")
  }

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Saathi...</p>
        </div>
      </main>
    )
  }



  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Enhanced Header */}
      <header className="border-b-2 border-border/50 bg-gradient-to-r from-card/80 to-card/60 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
                  <BarChart3 className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                    Saathi
                  </h1>
                  <p className="text-sm text-muted-foreground font-medium">Collaborative Task Manager</p>
                </div>
              </div>


            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3">
                <Avatar className="w-8 h-8 border-2 border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                    {user.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">{user.username}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Separator orientation="vertical" className="h-8 hidden sm:block" />
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="border-border hover:bg-secondary/80 shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline ml-2 font-medium">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Enhanced Invitation Notifications */}
        {user && (
          <InvitationNotifications
            userEmail={user.email}
            onInvitationAccepted={refreshWorkspaces}
          />
        )}

        {/* Enhanced Workspace Switcher */}
        <Card className="mb-8 border-2 border-border/50 shadow-sm bg-gradient-to-r from-card to-card/80">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Active Workspace
            </CardTitle>
            <CardDescription>Select or create a workspace to collaborate with your team</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceSwitcher
              workspaces={workspaces}
              currentWorkspaceId={currentWorkspaceId}
              onSelectWorkspace={setCurrentWorkspaceId}
              onCreateWorkspace={createWorkspace}
              currentUserEmail={user.email}
              onWorkspaceUpdated={refreshWorkspaces}
            />
          </CardContent>
        </Card>

        {currentWorkspace && (
          <>
            {/* Enhanced Workspace Header */}
            <Card className="mb-8 border-2 border-primary/20 shadow-lg bg-gradient-to-r from-primary/5 to-primary/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border-2 border-primary/20">
                      <BarChart3 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <WorkspaceNameInlineEditor
                        workspaceId={currentWorkspace.id}
                        currentName={currentWorkspace.name}
                        isOwner={currentWorkspace.ownerId === user.email}
                        onNameUpdated={refreshWorkspaces}
                        className="text-2xl font-bold text-foreground mb-1"
                      />
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>{currentWorkspace.members.length} member{currentWorkspace.members.length !== 1 ? 's' : ''}</span>
                        </div>

                        <Separator orientation="vertical" className="h-4" />
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>Created {new Date(currentWorkspace.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {currentWorkspace.ownerId === user.email && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        Owner
                      </Badge>
                    )}
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {Math.round((tasks.filter(t => t.completed).length / Math.max(tasks.length, 1)) * 100)}% Complete
                      </p>
                      <Progress
                        value={(tasks.filter(t => t.completed).length / Math.max(tasks.length, 1)) * 100}
                        className="w-24 h-2 mt-1"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
              {/* Enhanced Task List */}
              <div className="xl:col-span-3">
                <Card className="border-2 border-border/50 shadow-lg">
                  <CardHeader className="border-b border-border/50 bg-gradient-to-r from-card to-card/80">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      Tasks
                    </CardTitle>
                    <CardDescription>
                      Manage and track your team's tasks and progress
                    </CardDescription>
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

              {/* Enhanced Sidebar */}
              <div className="xl:col-span-1 space-y-6">
                {/* Real-time Status */}
                {currentWorkspaceId && (
                  <Card className="border-2 border-border/50 shadow-lg">
                    <CardHeader className="border-b border-border/50 bg-gradient-to-r from-card to-card/80">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        Real-time Status
                      </CardTitle>
                      <CardDescription>
                        Live collaboration active
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-2 bg-green-500/5 rounded-lg border border-green-200">
                          <span className="text-sm font-medium text-green-700">Connection</span>
                          <Badge className="bg-green-500/10 text-green-700 border-green-300 text-xs">
                            Active
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-2 bg-blue-500/5 rounded-lg border border-blue-200">
                          <span className="text-sm font-medium text-blue-700">Updates</span>
                          <Badge className="bg-blue-500/10 text-blue-700 border-blue-300 text-xs">
                            Real-time
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Member Management */}
                <Card className="border-2 border-border/50 shadow-lg">
                  <CardHeader className="border-b border-border/50 bg-gradient-to-r from-card to-card/80">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      Team Members
                    </CardTitle>
                    <CardDescription>
                      Manage workspace members and permissions
                    </CardDescription>
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

                {/* Enhanced Workspace Stats */}
                <Card className="border-2 border-border/50 shadow-lg bg-gradient-to-br from-card to-card/90">
                  <CardHeader className="border-b border-border/50">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      Workspace Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm font-medium text-muted-foreground">Total Tasks</span>
                        <Badge variant="outline" className="font-bold">
                          {tasks.length}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-green-500/5 rounded-lg border border-green-200">
                        <span className="text-sm font-medium text-green-700">Completed</span>
                        <Badge className="bg-green-500/10 text-green-700 border-green-300 font-bold">
                          {tasks.filter(t => t.completed).length}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-blue-500/5 rounded-lg border border-blue-200">
                        <span className="text-sm font-medium text-blue-700">In Progress</span>
                        <Badge className="bg-blue-500/10 text-blue-700 border-blue-300 font-bold">
                          {tasks.filter(t => !t.completed).length}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-purple-500/5 rounded-lg border border-purple-200">
                        <span className="text-sm font-medium text-purple-700">Team Members</span>
                        <Badge className="bg-purple-500/10 text-purple-700 border-purple-300 font-bold">
                          {currentWorkspace.members.length}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            </div>
          </>
        )}

        {!currentWorkspace && workspaces.length === 0 && (
          <Card className="border-2 border-dashed border-border/50 shadow-lg bg-gradient-to-br from-card to-card/80">
            <CardContent className="flex flex-col items-center justify-center py-16 px-8">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 border-2 border-primary/20">
                <BarChart3 className="w-10 h-10 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold text-center mb-3 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                Welcome to Saathi!
              </CardTitle>
              <CardDescription className="text-center mb-8 text-lg max-w-md">
                Create your first workspace to start collaborating on tasks with your team.
                Organize projects, track progress, and work together seamlessly.
              </CardDescription>
              <Button
                onClick={() => createWorkspace("My First Workspace")}
                size="lg"
                className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg font-semibold"
              >
                <BarChart3 className="w-5 h-5 mr-2" />
                Create Your First Workspace
              </Button>
            </CardContent>
          </Card>
        )}


      </div>
    </main >
  )
}