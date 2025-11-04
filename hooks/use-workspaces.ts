"use client"

import { useEffect, useState, useCallback } from "react"
import { getTasks, addTask, toggleTask, deleteTask, updateTask } from "@/app/tasks/actions"
import {
  getUserWorkspaces,
  createWorkspace as createWorkspaceAction,
  inviteMemberToWorkspace,
  removeMemberFromWorkspace,
  type Workspace
} from "@/app/actions/workspaces"

export function useWorkspaces(userEmail?: string) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Load user workspaces
  useEffect(() => {
    if (!userEmail) {
      setLoading(false)
      return
    }



    const loadWorkspaces = async () => {
      try {
        const userWorkspaces = await getUserWorkspaces(userEmail)

        if (userWorkspaces.length === 0) {
          // Create default workspace if none exist
          const defaultWorkspace = await createWorkspaceAction("My Workspace")
          setWorkspaces([defaultWorkspace])
          setCurrentWorkspaceId(defaultWorkspace.id)
        } else {
          setWorkspaces(userWorkspaces)
          setCurrentWorkspaceId(userWorkspaces[0].id)
        }
      } catch (error) {
        console.error("[Saathi] Failed to load workspaces:", error)
      } finally {
        setLoading(false)
      }
    }

    loadWorkspaces()
  }, [userEmail])

  // Load tasks when workspace changes
  useEffect(() => {
    if (!currentWorkspaceId || !userEmail) return



    const loadTasks = async () => {
      try {
        const result = await getTasks(currentWorkspaceId)
        if (result.tasks) {
          setTasks(result.tasks)
        } else if (result.error) {
          console.error("[Saathi] Failed to load tasks:", result.error)
        }
      } catch (error) {
        console.error("[Saathi] Failed to load tasks:", error)
      }
    }

    loadTasks()
  }, [currentWorkspaceId, userEmail])

  // Polling disabled - using real-time updates instead for better performance

  const handleCreateWorkspace = useCallback(
    async (name: string) => {
      if (!userEmail) return

      try {
        const newWorkspace = await createWorkspaceAction(name)
        setWorkspaces(prev => [...prev, newWorkspace])
        setCurrentWorkspaceId(newWorkspace.id)
        return newWorkspace
      } catch (error) {
        console.error("[Saathi] Failed to create workspace:", error)
        throw error
      }
    },
    [userEmail],
  )

  const handleAddTask = useCallback(
    async (title: string, description?: string, priority?: "low" | "medium" | "high", dueDate?: string) => {
      if (!currentWorkspaceId) return
      try {
        const result = await addTask(currentWorkspaceId, title, description, dueDate, undefined, priority)
        if (result.error) {
          throw new Error(result.error)
        }
        // Optimistic update - add task immediately to UI
        if (result.task) {
          setTasks(prev => [result.task, ...prev])
        }
        return result.task
      } catch (error) {
        console.error("[Saathi] Failed to add task:", error)
        throw error
      }
    },
    [currentWorkspaceId],
  )

  const handleToggleTask = useCallback(
    async (taskId: string) => {
      if (!currentWorkspaceId) return
      try {
        // Optimistic update - toggle immediately in UI
        setTasks(prev => prev.map(task =>
          task.id === taskId
            ? { ...task, completed: !task.completed, updatedAt: new Date().toISOString() }
            : task
        ))

        const result = await toggleTask(taskId)
        if (result.error) {
          // Revert optimistic update on error
          setTasks(prev => prev.map(task =>
            task.id === taskId
              ? { ...task, completed: !task.completed }
              : task
          ))
          throw new Error(result.error)
        }
      } catch (error) {
        console.error("[Saathi] Failed to toggle task:", error)
        throw error
      }
    },
    [currentWorkspaceId],
  )

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!currentWorkspaceId) return
      try {
        // Optimistic update - remove immediately from UI
        const taskToDelete = tasks.find(t => t.id === taskId)
        setTasks(prev => prev.filter(task => task.id !== taskId))

        const result = await deleteTask(taskId)
        if (result.error) {
          // Revert optimistic update on error
          if (taskToDelete) {
            setTasks(prev => [...prev, taskToDelete].sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ))
          }
          throw new Error(result.error)
        }
      } catch (error) {
        console.error("[Saathi] Failed to delete task:", error)
        throw error
      }
    },
    [currentWorkspaceId, tasks],
  )

  const handleEditTask = useCallback(
    async (taskId: string, updates: { title?: string; description?: string; dueDate?: string; priority?: "low" | "medium" | "high" }) => {
      if (!currentWorkspaceId) return
      try {
        // Optimistic update - update immediately in UI
        const originalTask = tasks.find(t => t.id === taskId)
        setTasks(prev => prev.map(task =>
          task.id === taskId
            ? { ...task, ...updates, updatedAt: new Date().toISOString() }
            : task
        ))

        const result = await updateTask(taskId, updates)
        if (result.error) {
          // Revert optimistic update on error
          if (originalTask) {
            setTasks(prev => prev.map(task =>
              task.id === taskId ? originalTask : task
            ))
          }
          throw new Error(result.error)
        }
      } catch (error) {
        console.error("[Saathi] Failed to edit task:", error)
        throw error
      }
    },
    [currentWorkspaceId, tasks],
  )

  const handleAssignTask = useCallback(
    async (taskId: string, assignedTo: string | null) => {
      if (!currentWorkspaceId) return
      try {
        // Optimistic update - assign immediately in UI
        const originalTask = tasks.find(t => t.id === taskId)
        setTasks(prev => prev.map(task =>
          task.id === taskId
            ? { ...task, assigneeEmail: assignedTo || undefined, updatedAt: new Date().toISOString() }
            : task
        ))

        const result = await updateTask(taskId, { assigneeEmail: assignedTo || undefined })
        if (result.error) {
          // Revert optimistic update on error
          if (originalTask) {
            setTasks(prev => prev.map(task =>
              task.id === taskId ? originalTask : task
            ))
          }
          throw new Error(result.error)
        }
      } catch (error) {
        console.error("[Saathi] Failed to assign task:", error)
        throw error
      }
    },
    [currentWorkspaceId, tasks],
  )

  const handleAddMember = useCallback(
    async (email: string) => {
      if (!currentWorkspaceId || !userEmail) return

      try {
        await inviteMemberToWorkspace(currentWorkspaceId, email)
        // Note: Member won't be added until they accept the invitation
        // No need to refresh workspaces here
      } catch (error) {
        console.error("[Saathi] Failed to send invitation:", error)
        throw error
      }
    },
    [currentWorkspaceId, userEmail],
  )

  // Add function to refresh workspaces (for when invitations are accepted)
  const refreshWorkspaces = useCallback(
    async () => {
      if (!userEmail) return

      try {
        const updatedWorkspaces = await getUserWorkspaces(userEmail)
        setWorkspaces(updatedWorkspaces)
      } catch (error) {
        console.error("[Saathi] Failed to refresh workspaces:", error)
      }
    },
    [userEmail],
  )

  // Add function to refresh tasks (for real-time updates)
  const refreshTasks = useCallback(
    async () => {
      if (!currentWorkspaceId) return

      try {
        const result = await getTasks(currentWorkspaceId)
        if (result.tasks) {
          setTasks(result.tasks)
        }
      } catch (error) {
        console.error("[Saathi] Failed to refresh tasks:", error)
      }
    },
    [currentWorkspaceId],
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
          if (updatedWorkspaces.length > 0) {
            setCurrentWorkspaceId(updatedWorkspaces[0].id)
          } else {
            setCurrentWorkspaceId(null)
            setTasks([])
          }
        }
      } catch (error) {
        console.error("[Saathi] Failed to remove member:", error)
        throw error
      }
    },
    [currentWorkspaceId, userEmail],
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
  }
}
