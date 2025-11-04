"use client"

import { useEffect, useState, useCallback } from "react"
import type { Task } from "@/app/actions/tasks"
import { getTasks, addTask, toggleTask, deleteTask, updateTask } from "@/app/actions/tasks"

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  // Load initial tasks
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await getTasks()
        setTasks(data)
      } catch (error) {
        console.error("[v0] Failed to load tasks:", error)
      } finally {
        setLoading(false)
      }
    }

    loadTasks()
  }, [])

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null

    const startPolling = () => {
      pollInterval = setInterval(async () => {
        try {
          const data = await getTasks()
          setTasks(data)
        } catch (error) {
          console.error("[v0] Polling error:", error)
        }
      }, 2000)
    }

    startPolling()

    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [])

  const handleAddTask = useCallback(async (title: string, dueDate?: string, categories?: string[]) => {
    try {
      await addTask(title, dueDate, categories)
      // Refresh tasks immediately after adding
      const data = await getTasks()
      setTasks(data)
    } catch (error) {
      console.error("[v0] Failed to add task:", error)
    }
  }, [])

  const handleToggleTask = useCallback(async (id: string) => {
    try {
      await toggleTask(id)
      // Refresh tasks immediately after toggling
      const data = await getTasks()
      setTasks(data)
    } catch (error) {
      console.error("[v0] Failed to toggle task:", error)
    }
  }, [])

  const handleDeleteTask = useCallback(async (id: string) => {
    try {
      await deleteTask(id)
      // Refresh tasks immediately after deleting
      const data = await getTasks()
      setTasks(data)
    } catch (error) {
      console.error("[v0] Failed to delete task:", error)
    }
  }, [])

  const handleUpdateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    try {
      await updateTask(id, updates)
      // Refresh tasks immediately after updating
      const data = await getTasks()
      setTasks(data)
    } catch (error) {
      console.error("[v0] Failed to update task:", error)
    }
  }, [])

  return {
    tasks,
    loading,
    addTask: handleAddTask,
    toggleTask: handleToggleTask,
    deleteTask: handleDeleteTask,
    updateTask: handleUpdateTask,
  }
}
