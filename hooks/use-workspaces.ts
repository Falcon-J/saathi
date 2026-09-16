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
import { getMutationError } from "@/lib/mutation-result"

export function useWorkspaces(userEmail?: string) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedUserEmail, setLoadedUserEmail] = useState<string | null>(null)
  const selectionRef = useRef({ workspaceId: currentWorkspaceId, userEmail })
  useEffect(() => { selectionRef.current = { workspaceId: currentWorkspaceId, userEmail } }, [currentWorkspaceId, userEmail])
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

  const handleRealtimeResync = useCallback(async () => {
    if (!currentWorkspaceId || !userEmail) return
    try {
      const [result, updatedWorkspaces] = await Promise.all([getTasks(currentWorkspaceId), getUserWorkspaces(userEmail)])
      if (selectionRef.current.workspaceId !== currentWorkspaceId || selectionRef.current.userEmail !== userEmail) return
      setWorkspaces(updatedWorkspaces)
      setWorkspaceError(null)
      if (!updatedWorkspaces.some(workspace => workspace.id === currentWorkspaceId)) {
        setCurrentWorkspaceId(updatedWorkspaces[0]?.id ?? null)
        updateTasks(() => [])
        return
      }
      if (result.tasks) {
        setTaskError(null)
        updateTasks(() => result.tasks ?? [])
      } else if (result.error) setTaskError(result.error)
    } catch (caughtError) {
      if (selectionRef.current.workspaceId === currentWorkspaceId && selectionRef.current.userEmail === userEmail) {
        setTaskError(caughtError instanceof Error ? caughtError.message : "Unable to refresh workspace")
      }
    }
  }, [currentWorkspaceId, updateTasks, userEmail])

  const applyRealtimeTaskEvent = useCallback((event: RealtimeEvent) => {
    if (event.workspaceId === currentWorkspaceId) void handleRealtimeResync()
  }, [currentWorkspaceId, handleRealtimeResync])

  const realtime = useRealtime({
    workspaceId: currentWorkspaceId ?? "",
    onTaskCreated: applyRealtimeTaskEvent,
    onTaskUpdated: applyRealtimeTaskEvent,
    onTaskToggled: applyRealtimeTaskEvent,
    onTaskDeleted: applyRealtimeTaskEvent,
    onResyncRequired: handleRealtimeResync,
  })

  // Load user workspaces
  useEffect(() => {
    if (!userEmail) {
      setLoading(false)
      setLoadedUserEmail(null)
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
          setLoadedUserEmail(userEmail)
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
        if (selectionRef.current.workspaceId !== workspaceId) return null
        if (result.tasks) {
          setTaskError(null)
          updateTasks(() => result.tasks ?? [])
          return result.tasks
        }
        if (result.error) setTaskError(result.error)
      } catch (error) {
        console.error("[Saathi] Failed to refresh tasks after a mutation error:", error)
        if (selectionRef.current.workspaceId === workspaceId) setTaskError(error instanceof Error ? error.message : "Unable to load tasks")
      } finally {
        if (selectionRef.current.workspaceId === workspaceId) setTasksLoading(false)
      }
      return null
    },
    [updateTasks],
  )

  const handleCreateWorkspace = useCallback(
    async (name: string, details?: { summary?: string; targetDate?: string | null }) => {
      if (!userEmail) return

      try {
        const newWorkspace = await createWorkspaceAction(name, details)
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
    async (title: string, description?: string, priority?: "low" | "medium" | "high", dueDate?: string, bucket?: "today" | "next", estimatedMinutes?: number, dueAt?: string) => {
      if (!currentWorkspaceId) return
      try {
        const result = await addTask(currentWorkspaceId, title, description, dueDate, undefined, priority, bucket, estimatedMinutes, dueAt)
        if (result.error) {
          return result
        }
        // Optimistic update - add task immediately to UI
        const createdTask = result.task
        if (createdTask && selectionRef.current.workspaceId === currentWorkspaceId) {
          updateTasks((prev) => [createdTask, ...prev.filter((task) => task.id !== createdTask.id)])
        }
        return createdTask
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
      if (pendingTaskIdsRef.current.has(taskId)) return { error: "This task is already being updated. Please wait." }
      pendingTaskIdsRef.current.add(taskId)
      try {
        // Optimistic update - toggle immediately in UI
        const nextStatus: TaskStatus = originalTask?.status === "done" ? "todo" : "done"
        updateTasks((prev) => prev.map(task =>
          task.id === taskId
            ? { ...task, status: nextStatus, completed: nextStatus === "done" }
            : task
        ))

        const result = await toggleTask(taskId, originalTask?.version ?? originalTask?.updatedAt)
        if (result.error) {
          // Revert optimistic update on error
          const refreshedTasks = await refreshTasksForWorkspace(currentWorkspaceId)
          if (!refreshedTasks && selectionRef.current.workspaceId === currentWorkspaceId) {
            updateTasks((prev) => prev.map((task) => (
              task.id === taskId && originalTask
                ? originalTask
                : task
            )))
          }
          throw new Error(result.error)
        }
        const toggledTask = result.task
        if (toggledTask && selectionRef.current.workspaceId === currentWorkspaceId) {
          updateTasks((prev) => prev.map((task) => task.id === taskId ? toggledTask : task))
        }
      } catch (error) {
        console.error("[Saathi] Failed to toggle task:", error)
        await refreshTasksForWorkspace(currentWorkspaceId)
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
      if (pendingTaskIdsRef.current.has(taskId)) return { error: "This task is already being updated. Please wait." }
      pendingTaskIdsRef.current.add(taskId)
      try {
        // Optimistic update - remove immediately from UI
        updateTasks((prev) => prev.filter((task) => task.id !== taskId))

        const result = await deleteTask(taskId, taskToDelete?.version ?? taskToDelete?.updatedAt)
        if (result.error) {
          // Revert optimistic update on error
          const refreshedTasks = await refreshTasksForWorkspace(currentWorkspaceId)
          if (!refreshedTasks && taskToDelete && selectionRef.current.workspaceId === currentWorkspaceId) {
            updateTasks((prev) => [...prev.filter((task) => task.id !== taskId), taskToDelete].sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ))
          }
          throw new Error(result.error)
        }
      } catch (error) {
        console.error("[Saathi] Failed to delete task:", error)
        await refreshTasksForWorkspace(currentWorkspaceId)
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
      if (pendingTaskIdsRef.current.has(taskId)) return { error: "This task is already being updated. Please wait." }
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

        const result = await updateTask(taskId, updates, originalTask?.version ?? originalTask?.updatedAt)
        if (result.error) {
          // Revert optimistic update on error
          const refreshedTasks = await refreshTasksForWorkspace(currentWorkspaceId)
          if (!refreshedTasks && originalTask && selectionRef.current.workspaceId === currentWorkspaceId) {
            updateTasks((prev) => prev.map((task) => (
              task.id === taskId ? originalTask : task
            )))
          }
          throw new Error(result.error)
        }
        const editedTask = result.task
        if (editedTask && selectionRef.current.workspaceId === currentWorkspaceId) {
          updateTasks((prev) => prev.map((task) => task.id === taskId ? editedTask : task))
        }
      } catch (error) {
        console.error("[Saathi] Failed to edit task:", error)
        await refreshTasksForWorkspace(currentWorkspaceId)
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
      if (pendingTaskIdsRef.current.has(taskId)) return { error: "This task is already being updated. Please wait." }
      pendingTaskIdsRef.current.add(taskId)
      try {
        // Optimistic update - assign immediately in UI
        updateTasks((prev) => prev.map(task =>
          task.id === taskId
            ? { ...task, assigneeEmail: assignedTo || undefined }
            : task
        ))

        const result = await updateTask(taskId, { assigneeEmail: assignedTo || undefined }, originalTask?.version ?? originalTask?.updatedAt)
        if (result.error) {
          // Revert optimistic update on error
          const refreshedTasks = await refreshTasksForWorkspace(currentWorkspaceId)
          if (!refreshedTasks && originalTask && selectionRef.current.workspaceId === currentWorkspaceId) {
            updateTasks((prev) => prev.map((task) => (
              task.id === taskId ? originalTask : task
            )))
          }
          throw new Error(result.error)
        }
        const assignedTask = result.task
        if (assignedTask && selectionRef.current.workspaceId === currentWorkspaceId) {
          updateTasks((prev) => prev.map((task) => task.id === taskId ? assignedTask : task))
        }
      } catch (error) {
        console.error("[Saathi] Failed to assign task:", error)
        await refreshTasksForWorkspace(currentWorkspaceId)
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
        const result = await inviteMemberToWorkspace(currentWorkspaceId, email)
        const invitationError = getMutationError(result)
        if (invitationError) throw new Error(invitationError)

        const deliveryStatus = result.invitation?.deliveryStatus
        const detail = deliveryStatus === "sent"
          ? `Email to ${email} was accepted by the provider.`
          : deliveryStatus === "failed"
            ? "Invitation created, but email could not be delivered. Copy the invite link from Team."
            : deliveryStatus === "unconfigured"
              ? "Invitation created. Email is unavailable, so copy the invite link from Team."
              : "Invitation created. Email delivery is queued."
        success("Invitation created", detail)
        // Note: Member won't be added until they accept the invitation
        // No need to refresh workspaces here
        return result
      } catch (error) {
        console.error("[Saathi] Failed to send invitation:", error)
        throw error
      }
    },
    [currentWorkspaceId, userEmail, success],
  )

  // Add function to refresh workspaces (for when invitations are accepted)
  const refreshWorkspaces = useCallback(
    async () => {
      if (!userEmail) return

      try {
        const updatedWorkspaces = await getUserWorkspaces(userEmail)
        if (selectionRef.current.userEmail !== userEmail) return
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
          info("Workspace access ended", "You no longer have access to this workspace")
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
    setCurrentWorkspaceId: (workspaceId: string) => {
      if (workspaceId !== currentWorkspaceId) {
        selectionRef.current = { workspaceId, userEmail }
        updateTasks(() => [])
        setTaskError(null)
        setTasksLoading(true)
        setCurrentWorkspaceId(workspaceId)
      }
    },
    tasks,
    loading: loading || Boolean(userEmail && loadedUserEmail !== userEmail),
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
