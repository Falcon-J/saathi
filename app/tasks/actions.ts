"use server"

import { redis } from "@/lib/redis"
import { getSession } from "@/lib/auth-simple"
import { revalidatePath } from "next/cache"
import { realtimeService } from "@/lib/realtime"

// Security: Validate workspace membership
async function validateWorkspaceMembership(userEmail: string, workspaceId: string) {
    try {
        const workspaceData = await redis.get(`workspace:${workspaceId}`)
        if (!workspaceData) {
            throw new Error("Workspace not found")
        }

        const workspace = typeof workspaceData === 'string' ? JSON.parse(workspaceData) : workspaceData
        const isMember = workspace.members?.some((m: any) => m.email === userEmail)

        if (!isMember) {
            throw new Error("Access denied: Not a member of this workspace")
        }

        return workspace
    } catch (error) {
        console.error("[Security] Workspace membership validation failed:", error)
        throw error
    }
}

// Security: Validate task permissions
async function validateTaskPermission(userEmail: string, taskId: string, action: 'edit' | 'delete' | 'toggle') {
    try {
        const taskData = await redis.get(taskId)
        if (!taskData) {
            throw new Error("Task not found")
        }

        const task = typeof taskData === 'string' ? JSON.parse(taskData) : taskData
        const workspace = await validateWorkspaceMembership(userEmail, task.workspaceId)

        const isOwner = workspace.ownerId === userEmail
        const isCreator = task.createdBy === userEmail
        const isAssignee = task.assigneeEmail === userEmail

        switch (action) {
            case 'edit':
                return isOwner || isCreator
            case 'delete':
                return isOwner || isCreator
            case 'toggle':
                return isOwner || isCreator || isAssignee
            default:
                return false
        }
    } catch (error) {
        console.error("[Security] Task permission validation failed:", error)
        throw error
    }
}

// Task types
export interface Task {
    id: string
    title: string
    description?: string
    completed: boolean
    priority: 'low' | 'medium' | 'high'
    dueDate?: string
    assigneeEmail?: string
    createdAt: string
    updatedAt: string
    workspaceId: string
    createdBy: string
}

// Server Actions for task management
export async function addTask(
    workspaceId: string,
    title: string,
    description?: string,
    dueDate?: string,
    assigneeEmail?: string,
    priority: 'low' | 'medium' | 'high' = 'medium'
) {
    try {
        const session = await getSession()
        if (!session) {
            return { error: "Authentication required" }
        }

        // Security: Validate workspace membership
        await validateWorkspaceMembership(session.email, workspaceId)

        // Validate inputs
        if (!title || title.trim().length === 0) {
            return { error: "Task title is required" }
        }

        if (title.trim().length > 200) {
            return { error: "Task title must be less than 200 characters" }
        }

        if (description && description.length > 1000) {
            return { error: "Task description must be less than 1000 characters" }
        }

        const taskId = `task:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const task: Task = {
            id: taskId,
            title: title.trim(),
            description: description?.trim(),
            completed: false,
            priority,
            dueDate,
            assigneeEmail,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            workspaceId,
            createdBy: session.email
        }

        // Batch Redis operations for better performance
        const timestamp = Date.now().toString()

        // Execute Redis operations in parallel
        await Promise.all([
            redis.set(taskId, JSON.stringify(task)),
            redis.sadd(`workspace:${workspaceId}:tasks`, taskId),
            redis.set(`workspace:${workspaceId}:lastUpdate`, timestamp)
        ])

        // Publish real-time event asynchronously (completely non-blocking)
        setImmediate(() => {
            realtimeService.publishEvent({
                type: 'task-created',
                workspaceId,
                userId: session.email,
                timestamp: Date.now(),
                data: { task }
            }).catch(error => {
                console.error('[Realtime] Failed to publish task-created event:', error)
            })
        })

        revalidatePath('/tasks')
        return { success: true, task }
    } catch (error) {
        console.error("Add task error:", error)
        return { error: "Failed to create task" }
    }
}

export async function updateTask(taskId: string, updates: Partial<Task>) {
    try {
        const session = await getSession()
        if (!session) {
            return { error: "Authentication required" }
        }

        // Security: Validate task edit permission
        const hasPermission = await validateTaskPermission(session.email, taskId, 'edit')
        if (!hasPermission) {
            return { error: "Access denied: You don't have permission to edit this task" }
        }

        const existingTask = await redis.get(taskId)
        if (!existingTask) {
            return { error: "Task not found" }
        }

        const task = typeof existingTask === 'string' ? JSON.parse(existingTask) : existingTask
        const updatedTask = {
            ...task,
            ...updates,
            updatedAt: new Date().toISOString()
        }

        // Batch Redis operations for better performance
        const timestamp = Date.now().toString()

        await Promise.all([
            redis.set(taskId, JSON.stringify(updatedTask)),
            redis.set(`workspace:${task.workspaceId}:lastUpdate`, timestamp)
        ])

        // Publish real-time event asynchronously (completely non-blocking)
        setImmediate(() => {
            realtimeService.publishEvent({
                type: 'task-updated',
                workspaceId: task.workspaceId,
                userId: session.email,
                timestamp: Date.now(),
                data: { task: updatedTask, updates }
            }).catch(error => {
                console.error('[Realtime] Failed to publish task-updated event:', error)
            })
        })

        revalidatePath('/tasks')
        return { success: true, task: updatedTask }
    } catch (error) {
        console.error("Update task error:", error)
        return { error: "Failed to update task" }
    }
}

export async function deleteTask(taskId: string) {
    try {
        const session = await getSession()
        if (!session) {
            return { error: "Authentication required" }
        }

        // Security: Validate task delete permission
        const hasPermission = await validateTaskPermission(session.email, taskId, 'delete')
        if (!hasPermission) {
            return { error: "Access denied: You don't have permission to delete this task" }
        }

        const existingTask = await redis.get(taskId)
        if (!existingTask) {
            return { error: "Task not found" }
        }

        const task = typeof existingTask === 'string' ? JSON.parse(existingTask) : existingTask

        // Batch Redis operations for better performance
        const timestamp = Date.now().toString()

        await Promise.all([
            redis.del(taskId),
            redis.srem(`workspace:${task.workspaceId}:tasks`, taskId),
            redis.set(`workspace:${task.workspaceId}:lastUpdate`, timestamp)
        ])

        // Publish real-time event asynchronously (completely non-blocking)
        setImmediate(() => {
            realtimeService.publishEvent({
                type: 'task-deleted',
                workspaceId: task.workspaceId,
                userId: session.email,
                timestamp: Date.now(),
                data: { taskId, task }
            }).catch(error => {
                console.error('[Realtime] Failed to publish task-deleted event:', error)
            })
        })

        revalidatePath('/tasks')
        return { success: true }
    } catch (error) {
        console.error("Delete task error:", error)
        return { error: "Failed to delete task" }
    }
}

export async function toggleTask(taskId: string) {
    try {
        const session = await getSession()
        if (!session) {
            return { error: "Authentication required" }
        }

        // Security: Validate task toggle permission
        const hasPermission = await validateTaskPermission(session.email, taskId, 'toggle')
        if (!hasPermission) {
            return { error: "Access denied: You don't have permission to toggle this task" }
        }

        const existingTask = await redis.get(taskId)
        if (!existingTask) {
            return { error: "Task not found" }
        }

        const task = typeof existingTask === 'string' ? JSON.parse(existingTask) : existingTask
        const updatedTask = {
            ...task,
            completed: !task.completed,
            updatedAt: new Date().toISOString()
        }

        // Batch Redis operations for better performance
        const timestamp = Date.now().toString()

        await Promise.all([
            redis.set(taskId, JSON.stringify(updatedTask)),
            redis.set(`workspace:${task.workspaceId}:lastUpdate`, timestamp)
        ])

        // Publish real-time event asynchronously (completely non-blocking)
        setImmediate(() => {
            realtimeService.publishEvent({
                type: 'task-toggled',
                workspaceId: task.workspaceId,
                userId: session.email,
                timestamp: Date.now(),
                data: { task: updatedTask }
            }).catch(error => {
                console.error('[Realtime] Failed to publish task-toggled event:', error)
            })
        })

        revalidatePath('/tasks')
        return { success: true, task: updatedTask }
    } catch (error) {
        console.error("Toggle task error:", error)
        return { error: "Failed to toggle task" }
    }
}
export async function getTasks(workspaceId: string) {
    try {
        const session = await getSession()
        if (!session) {
            return { error: "Authentication required" }
        }

        // Security: Validate workspace membership
        await validateWorkspaceMembership(session.email, workspaceId)

        // Get task IDs for the workspace
        const taskIds = await redis.smembers(`workspace:${workspaceId}:tasks`)

        if (!taskIds || taskIds.length === 0) {
            return { success: true, tasks: [] }
        }

        // Get all tasks
        const tasks: Task[] = []
        for (const taskId of taskIds) {
            const taskData = await redis.get(taskId)
            if (taskData) {
                const task = typeof taskData === 'string' ? JSON.parse(taskData) : taskData
                tasks.push(task)
            }
        }

        // Sort by creation date (newest first)
        tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        return { success: true, tasks }
    } catch (error) {
        console.error("Get tasks error:", error)
        return { error: "Failed to load tasks" }
    }
}