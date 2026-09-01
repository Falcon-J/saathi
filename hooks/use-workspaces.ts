"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { getTasks, addTask, toggleTask, deleteTask, updateTask, type Task, type TaskStatus } from "@/app/tasks/actions"
import {
  getUserWorkspaces,
  createWorkspace as createWorkspaceAction,
  inviteMemberToWorkspace,
  removeMemberFromWorkspace,
  type Workspace
} from "@/app/actions/workspaces"
import { useNotifications } from "@/hooks/use-notifications"
import { useRealtime } from "@/hooks/useRealtime"
import type { RealtimeEvent } from "@/lib/realtime"
import type { TaskUpdate } from "@/app/tasks/contract"
import { normalizeEmail } from "@/lib/identity"

export function useWorkspaces(userEmail?: string) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [tasksLoading, setTasksLoading] = useState(false)
  const tasksRef = useRef<Task[]>([])
  const pendingTaskIdsRef = useRef(new Set<string>())
  const { success, error: notifyError, info } = useNotifications()

  const updateTasks = useCallback((updater: (currentTasks: Task[]) => Task[]) => {
    setTasks((currentTasks) => {
      const nextTasks = updater(currentTasks)
      tasksRef.current = nextTasks
      return nextTasks
    })
  }, [])

  const applyRealtimeTaskEvent = useCallback((event: RealtimeEvent) => {
    if (!userEmail) {
      return
    }

    if (event.workspaceId !== currentWorkspaceId) {
      return
    }

    const task = event.data?.task ?? event.data

    const taskId = event.type === "task-deleted" ? event.data?.taskId ?? task?.id : task?.id
    if (taskId && pendingTaskIdsRef.current.has(taskId)) {
      return
    }

    updateTasks((currentTasks) => {
      switch (event.type) {
        case "task-created":
          if (!task?.id) return currentTasks
          return currentTasks.some((existing) => existing.id === task.id)
            ? currentTasks
            : [task, ...currentTasks]
        case "task-updated":
        case "task-toggled": {
          if (!task?.id) return currentTasks
          const currentTask = currentTasks.find((existing) => existing.id === task.id)
          if (
            currentTask?.updatedAt
            && task.updatedAt
            && new Date(task.updatedAt).getTime() < new Date(currentTask.updatedAt).getTime()
          ) {
            return currentTasks
          }
          return currentTasks.map((existing) => existing.id === task.id ? { ...existing, ...task } : existing)
        }
        case "task-deleted":
          if (!taskId) return currentTasks
          return currentTasks.filter((existing) => existing.id !== taskId)
        default:
          return currentTasks
      }
    })
  }, [currentWorkspaceId, updateTasks, userEmail])

  const realtime = useRealtime({
    workspaceId: currentWorkspaceId ?? "",
    onTaskCreated: applyRealtimeTaskEvent,
    onTaskUpdated: applyRealtimeTaskEvent,
    onTaskToggled: applyRealtimeTaskEvent,
    onTaskDeleted: applyRealtimeTaskEvent,
  })

  // Load user workspaces
  useEffect(() => {
    if (!userEmail) {
      setLoading(false)
      setWorkspaceError(null)
      setWorkspaces([])
      setCurrentWorkspaceId(null)
      updateTasks(() => [])
      return
    }

    let cancelled = false
    setLoading(true)
    setWorkspaceError(null)
    setWorkspaces([])
    setCurrentWorkspaceId(null)

    const loadWorkspaces = async () => {
      try {
        const userWorkspaces = await getUserWorkspaces(userEmail)
        if (cancelled) return

        setWorkspaceError(null)
        setWorkspaces(userWorkspaces)
        setCurrentWorkspaceId(userWorkspaces[0]?.id ?? null)
      } catch (error) {
        if (!cancelled) {
          console.error("[Saathi] Failed to load workspaces:", error)
          setWorkspaceError(error instanceof Error ? error.message : "Unable to load workspaces")
          setWorkspaces([])
          setCurrentWorkspaceId(null)
          updateTasks(() => [])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadWorkspaces()
    return () => {
      cancelled = true
    }
  }, [updateTasks, userEmail])

  // Load tasks when workspace changes
  useEffect(() => {
    if (!currentWorkspaceId || !userEmail) {
      setTaskError(null)
      setTasksLoading(false)
      updateTasks(() => [])
      return
    }



    let cancelled = false
    setTaskError(null)
    setTasksLoading(true)
    updateTasks(() => [])
    const loadTasks = async () => {
      try {
        const result = await getTasks(currentWorkspaceId)
        if (!cancelled && result.tasks) {
          setTaskError(null)
          updateTasks(() => result.tasks ?? [])
        } else if (!cancelled && result.error) {
          console.error("[Saathi] Failed to load tasks:", result.error)
          setTaskError(result.error)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[Saathi] Failed to load tasks:", error)
          setTaskError(error instanceof Error ? error.message : "Unable to load tasks")
        }
      }
      if (!cancelled) setTasksLoading(false)
    }

    loadTasks()
    return () => {
      cancelled = true
    }
  }, [currentWorkspaceId, updateTasks, userEmail])

  // Polling disabled - using real-time updates instead for better performance

  const refreshTasksForWorkspace = useCallback(
    async (workspaceId: string): Promise<Task[] | null> => {
      setTasksLoading(true)
      try {
        const result = await getTasks(workspaceId)
        if (result.tasks) {
          setTaskError(null)
          updateTasks(() => result.tasks ?? [])
          return result.tasks
        }
        if (result.error) setTaskError(result.error)
      } catch (error) {
        console.error("[Saathi] Failed to refresh tasks after a mutation error:", error)
        setTaskError(error instanceof Error ? error.message : "Unable to load tasks")
      } finally {
        setTasksLoading(false)
      }
      return null
    },
    [updateTasks],
  )

  const handleCreateWorkspace = useCallback(
    async (name: string) => {
      if (!userEmail) return

      try {
        const newWorkspace = await createWorkspaceAction(name)
        setWorkspaces(prev => [...prev, newWorkspace])
        setCurrentWorkspaceId(newWorkspace.id)
        success("Workspace created", `"${name}" workspace has been created successfully`)
        return newWorkspace
      } catch (error) {
        console.error("[Saathi] Failed to create workspace:", error)
        notifyError("Failed to create workspace", "Please try again with a different name")
        throw error
      }
    },
    [userEmail, success, notifyError],
  )

  const handleAddTask = useCallback(
    async (title: string, description?: string, priority?: "low" | "medium" | "high", dueDate?: string) => {
      if (!currentWorkspaceId) return
      try {
        const result = await addTask(currentWorkspaceId, title, description, dueDate, undefined, priority)
        if (result.error) {
          return result
        }
        // Optimistic update - add task immediately to UI
        if (result.task) {
          updateTasks((prev) => [result.task, ...prev.filter((task) => task.id !== result.task.id)])
        }
        return result.task
      } catch (error) {
        console.error("[Saathi] Failed to add task:", error)
        throw error
      }
    },
    [currentWorkspaceId, updateTasks],
  )

  const handleToggleTask = useCallback(
    async (taskId: string) => {
      if (!currentWorkspaceId) return
      const originalTask = tasksRef.current.find((task) => task.id === taskId)
      pendingTaskIdsRef.current.add(taskId)
      try {
        // Optimistic update - toggle immediately in UI
        const nextStatus: TaskStatus = originalTask?.status === "done" ? "todo" : "done"
        updateTasks((prev) => prev.map(task =>
          task.id === taskId
            ? { ...task, status: nextStatus, completed: nextStatus === "done" }
            : task
        ))

        const result = await toggleTask(taskId, originalTask?.updatedAt)
        if (result.error) {
          // Revert optimistic update on error
          const refreshedTasks = await refreshTasksForWorkspace(currentWorkspaceId)
          if (!refreshedTasks) {
            updateTasks((prev) => prev.map((task) => (
              task.id === taskId && originalTask
                ? originalTask
                : task
            )))
          }
          throw new Error(result.error)
        }
        if (result.task) {
          updateTasks((prev) => prev.map((task) => task.id === taskId ? result.task : task))
        }
      } catch (error) {
        console.error("[Saathi] Failed to toggle task:", error)
        throw error
      } finally {
        pendingTaskIdsRef.current.delete(taskId)
      }
    },
    [currentWorkspaceId, refreshTasksForWorkspace, updateTasks],
  )

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!currentWorkspaceId) return
      const taskToDelete = tasksRef.current.find((task) => task.id === taskId)
      pendingTaskIdsRef.current.add(taskId)
      try {
        // Optimistic update - remove immediately from UI
        updateTasks((prev) => prev.filter((task) => task.id !== taskId))

        const result = await deleteTask(taskId, taskToDelete?.updatedAt)
        if (result.error) {
          // Revert optimistic update on error
          const refreshedTasks = await refreshTasksForWorkspace(currentWorkspaceId)
          if (!refreshedTasks && taskToDelete) {
            updateTasks((prev) => [...prev.filter((task) => task.id !== taskId), taskToDelete].sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ))
          }
          throw new Error(result.error)
        }
      } catch (error) {
        console.error("[Saathi] Failed to delete task:", error)
        throw error
      } finally {
        pendingTaskIdsRef.current.delete(taskId)
      }
    },
    [currentWorkspaceId, refreshTasksForWorkspace, updateTasks],
  )

  const handleEditTask = useCallback(
    async (taskId: string, updates: TaskUpdate) => {
      if (!currentWorkspaceId) return
      const originalTask = tasksRef.current.find((task) => task.id === taskId)
      pendingTaskIdsRef.current.add(taskId)
      try {
        // Optimistic update - update immediately in UI
        updateTasks((prev) => prev.map((task) => {
          if (task.id !== taskId) return task

          const status = updates.status ?? task.status
          return {
            ...task,
            ...updates,
            ...(status ? { status, completed: status === "done" } : {}),
          }
        }))

        const result = await updateTask(taskId, updates, originalTask?.updatedAt)
        if (result.error) {
          // Revert optimistic update on error
          const refreshedTasks = await refreshTasksForWorkspace(currentWorkspaceId)
          if (!refreshedTasks && originalTask) {
            updateTasks((prev) => prev.map((task) => (
              task.id === taskId ? originalTask : task
            )))
          }
          throw new Error(result.error)
        }
        if (result.task) {
          updateTasks((prev) => prev.map((task) => task.id === taskId ? result.task : task))
        }
      } catch (error) {
        console.error("[Saathi] Failed to edit task:", error)
        throw error
      } finally {
        pendingTaskIdsRef.current.delete(taskId)
      }
    },
    [currentWorkspaceId, refreshTasksForWorkspace, updateTasks],
  )

  const handleAssignTask = useCallback(
    async (taskId: string, assignedTo: string | null) => {
      if (!currentWorkspaceId) return
      const originalTask = tasksRef.current.find((task) => task.id === taskId)
      pendingTaskIdsRef.current.add(taskId)
      try {
        // Optimistic update - assign immediately in UI
        updateTasks((prev) => prev.map(task =>
          task.id === taskId
            ? { ...task, assigneeEmail: assignedTo || undefined }
            : task
        ))

        const result = await updateTask(taskId, { assigneeEmail: assignedTo || undefined }, originalTask?.updatedAt)
        if (result.error) {
          // Revert optimistic update on error
          const refreshedTasks = await refreshTasksForWorkspace(currentWorkspaceId)
          if (!refreshedTasks && originalTask) {
            updateTasks((prev) => prev.map((task) => (
              task.id === taskId ? originalTask : task
            )))
          }
          throw new Error(result.error)
        }
        if (result.task) {
          updateTasks((prev) => prev.map((task) => task.id === taskId ? result.task : task))
        }
      } catch (error) {
        console.error("[Saathi] Failed to assign task:", error)
        throw error
      } finally {
        pendingTaskIdsRef.current.delete(taskId)
      }
    },
    [currentWorkspaceId, refreshTasksForWorkspace, updateTasks],
  )

  const handleAddMember = useCallback(
    async (email: string) => {
      if (!currentWorkspaceId || !userEmail) return

      try {
        await inviteMemberToWorkspace(currentWorkspaceId, email)
        success("Invitation created", `An in-app invitation is waiting for ${email}.`)
        // Note: Member won't be added until they accept the invitation
        // No need to refresh workspaces here
      } catch (error) {
        console.error("[Saathi] Failed to send invitation:", error)
        const errorMessage = error instanceof Error ? error.message : "Failed to send invitation"
        notifyError("Failed to send invitation", errorMessage)
        throw error
      }
    },
    [currentWorkspaceId, userEmail, success, notifyError],
  )

  // Add function to refresh workspaces (for when invitations are accepted)
  const refreshWorkspaces = useCallback(
    async () => {
      if (!userEmail) return

      try {
        const updatedWorkspaces = await getUserWorkspaces(userEmail)
        setWorkspaceError(null)
        setWorkspaces(updatedWorkspaces)
        setCurrentWorkspaceId((currentId) => (
          currentId && updatedWorkspaces.some((workspace) => workspace.id === currentId)
            ? currentId
            : updatedWorkspaces[0]?.id ?? null
        ))
      } catch (error) {
        console.error("[Saathi] Failed to refresh workspaces:", error)
        setWorkspaceError(error instanceof Error ? error.message : "Unable to load workspaces")
      }
    },
    [userEmail],
  )

  // Add function to refresh tasks (for real-time updates)
  const refreshTasks = useCallback(
    async () => {
      if (!currentWorkspaceId) return

      await refreshTasksForWorkspace(currentWorkspaceId)
    },
    [currentWorkspaceId, refreshTasksForWorkspace],
  )

  const handleRemoveMember = useCallback(
    async (memberEmail: string) => {
      if (!currentWorkspaceId || !userEmail) return

      try {
        await removeMemberFromWorkspace(currentWorkspaceId, memberEmail)

        // Refresh workspaces to get updated member list
        const updatedWorkspaces = await getUserWorkspaces(userEmail)
        setWorkspaces(updatedWorkspaces)

        // If the current workspace was deleted (owner left as only member), 
        // select the first available workspace or clear selection
        const workspaceStillExists = updatedWorkspaces.some(w => w.id === currentWorkspaceId)
        if (!workspaceStillExists) {
          info("Workspace deleted", "You were the last member, so the workspace has been deleted")
          if (updatedWorkspaces.length > 0) {
            setCurrentWorkspaceId(updatedWorkspaces[0].id)
          } else {
            setCurrentWorkspaceId(null)
            updateTasks(() => [])
          }
        } else {
          const isCurrentUser = normalizeEmail(memberEmail) === normalizeEmail(userEmail)
          success(
            isCurrentUser ? "Left workspace" : "Member removed",
            isCurrentUser ?
              "You have left the workspace" :
              `${memberEmail} has been removed from the workspace`
          )
        }
      } catch (error) {
        console.error("[Saathi] Failed to remove member:", error)
        const errorMessage = error instanceof Error ? error.message : "Failed to remove member"
        notifyError("Failed to remove member", errorMessage)
        throw error
      }
    },
    [currentWorkspaceId, updateTasks, userEmail, success, notifyError, info],
  )

  return {
    workspaces,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    tasks,
    loading,
    createWorkspace: handleCreateWorkspace,
    addTask: handleAddTask,
    toggleTask: handleToggleTask,
    deleteTask: handleDeleteTask,
    editTask: handleEditTask,
    assignTask: handleAssignTask,
    addMember: handleAddMember,
    removeMember: handleRemoveMember,
    refreshWorkspaces,
    refreshTasks,
    workspaceError,
    taskError,
    tasksLoading,
    realtime,
  }
}
