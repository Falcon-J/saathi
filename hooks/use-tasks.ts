"use client"

import { useCallback, useEffect, useState } from "react"
import type { Task } from "@/app/actions/tasks"
import { addTask, deleteTask, getTasks, toggleTask, updateTask } from "@/app/actions/tasks"

export function useTasks(workspaceId: string) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const refreshTasks = useCallback(async () => {
    if (!workspaceId) return

    try {
      const data = await getTasks(workspaceId)
      setTasks(data)
    } catch (error) {
      console.error("[Saathi] Failed to load tasks:", error)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    refreshTasks()
  }, [refreshTasks])

  const handleAddTask = useCallback(async (title: string, dueDate?: string, categories?: string[]) => {
    await addTask(workspaceId, title, undefined, dueDate, categories)
    await refreshTasks()
  }, [refreshTasks, workspaceId])

  const handleToggleTask = useCallback(async (id: string) => {
    await toggleTask(workspaceId, id)
    await refreshTasks()
  }, [refreshTasks, workspaceId])

  const handleDeleteTask = useCallback(async (id: string) => {
    await deleteTask(workspaceId, id)
    await refreshTasks()
  }, [refreshTasks, workspaceId])

  const handleUpdateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    await updateTask(workspaceId, id, updates)
    await refreshTasks()
  }, [refreshTasks, workspaceId])

  return {
    tasks,
    loading,
    addTask: handleAddTask,
    toggleTask: handleToggleTask,
    deleteTask: handleDeleteTask,
    updateTask: handleUpdateTask,
    refreshTasks,
  }
}
