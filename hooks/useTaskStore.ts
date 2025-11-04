"use client"

import { create } from 'zustand'
import { Task, TaskUpdate } from '@/lib/types'

interface TaskStore {
    tasks: Task[]
    loading: boolean
    error: string | null

    // Actions
    setTasks: (tasks: Task[]) => void
    addTask: (task: Task) => void
    updateTask: (taskId: string, updates: Partial<Task>) => void
    removeTask: (taskId: string) => void
    setLoading: (loading: boolean) => void
    setError: (error: string | null) => void

    // Real-time updates
    handleTaskUpdate: (update: TaskUpdate) => void

    // Filters and sorting
    filter: 'all' | 'active' | 'completed'
    sortBy: 'created' | 'priority' | 'dueDate'
    setFilter: (filter: 'all' | 'active' | 'completed') => void
    setSortBy: (sortBy: 'created' | 'priority' | 'dueDate') => void

    // Computed values
    getFilteredTasks: () => Task[]
    getSortedTasks: (tasks: Task[]) => Task[]
}

export const useTaskStore = create<TaskStore>((set, get) => ({
    tasks: [],
    loading: false,
    error: null,
    filter: 'all',
    sortBy: 'created',

    setTasks: (tasks) => set({ tasks }),

    addTask: (task) => set((state) => ({
        tasks: [...state.tasks, task]
    })),

    updateTask: (taskId, updates) => set((state) => ({
        tasks: state.tasks.map(task =>
            task.id === taskId ? { ...task, ...updates } : task
        )
    })),

    removeTask: (taskId) => set((state) => ({
        tasks: state.tasks.filter(task => task.id !== taskId)
    })),

    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    handleTaskUpdate: (update) => {
        const { action, taskId } = update

        switch (action) {
            case 'create':
                // Task will be added via API response
                break
            case 'update':
            case 'toggle':
                // Task will be updated via API response
                break
            case 'delete':
                get().removeTask(taskId)
                break
        }
    },

    setFilter: (filter) => set({ filter }),
    setSortBy: (sortBy) => set({ sortBy }),

    getFilteredTasks: () => {
        const { tasks, filter } = get()

        switch (filter) {
            case 'active':
                return tasks.filter(task => !task.completed)
            case 'completed':
                return tasks.filter(task => task.completed)
            default:
                return tasks
        }
    },

    getSortedTasks: (tasks) => {
        const { sortBy } = get()

        return [...tasks].sort((a, b) => {
            switch (sortBy) {
                case 'priority':
                    const priorityOrder = { high: 3, medium: 2, low: 1 }
                    return priorityOrder[b.priority] - priorityOrder[a.priority]
                case 'dueDate':
                    if (!a.dueDate && !b.dueDate) return 0
                    if (!a.dueDate) return 1
                    if (!b.dueDate) return -1
                    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
                default:
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            }
        })
    }
}))

// Hook for using task store with real-time updates
export function useTasksWithRealtime(workspaceId?: string) {
    const store = useTaskStore()

    // This would be used in components to sync with SSE
    return {
        ...store,
        filteredTasks: store.getSortedTasks(store.getFilteredTasks())
    }
}