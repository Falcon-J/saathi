"use server"

import { redis } from "@/lib/redis"
import { getSession } from "@/lib/auth-simple"
import { revalidatePath } from "next/cache"
import { realtimeService } from "@/lib/realtime"
import { recordUsageEvent } from "@/lib/usage"
import { authorizeWorkspaceMember } from "@/lib/workspace-policy"
import { normalizeEmail } from "@/lib/identity"
import { hasTaskConflict, normalizeTaskUpdates, type TaskUpdate } from "./contract"

// Security: Validate workspace membership
async function validateWorkspaceMembership(userEmail: string, workspaceId: string) {
    try {
        const workspaceData = await redis.get(`workspace:${workspaceId}`)
        if (!workspaceData) {
            throw new Error("Workspace not found")
        }

        const workspace = typeof workspaceData === 'string' ? JSON.parse(workspaceData) : workspaceData
        const authorization = authorizeWorkspaceMember(workspace, userEmail)

        if (!authorization.allowed) {
            throw new Error(authorization.message)
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

        const normalizedUserEmail = normalizeEmail(userEmail)
        const isOwner = normalizeEmail(workspace.ownerId) === normalizedUserEmail
        const isCreator = normalizeEmail(task.createdBy) === normalizedUserEmail
        const isAssignee = task.assigneeEmail && normalizeEmail(task.assigneeEmail) === normalizedUserEmail

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

// ── Task Types ──────────────────────────────────────────────────────────────

export interface Task {
    id: string
    title: string
    description?: string
    completed: boolean
    status?: TaskStatus
    priority: 'low' | 'medium' | 'high'
    dueDate?: string
    bucket?: "today" | "next"
    estimatedMinutes?: number
    assigneeEmail?: string
    createdAt: string
    updatedAt: string
    workspaceId: string
    createdBy: string
    categories?: string[]
    assignedTo?: string
}

export type TaskStatus = "todo" | "in-progress" | "done"

function normalizeTask(task: Task): Task {
    const status: TaskStatus = task.status === "todo" || task.status === "in-progress" || task.status === "done"
        ? task.status
        : task.completed ? "done" : "todo"
    return {
        ...task,
        status,
        completed: status === "done",
    }
}

// ── Workflow 1: Task Lifecycle (Server Actions) ─────────────────────────────
// addTask → updateTask → toggleTask → deleteTask → getTasks → assignTask

export async function addTask(
    workspaceId: string,
    title: string,
    description?: string,
    dueDate?: string,
    assigneeEmail?: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    bucket?: "today" | "next",
    estimatedMinutes?: number | null,
) {
    try {
        const session = await getSession()
        if (!session) {
            return { error: "Authentication required" }
        }

        // Security: Validate workspace membership
        const workspace = await validateWorkspaceMembership(session.email, workspaceId)

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

        if (priority !== 'low' && priority !== 'medium' && priority !== 'high') {
            return { error: "Task priority is invalid" }
        }

        if (dueDate && Number.isNaN(Date.parse(dueDate))) {
            return { error: "Task due date is invalid" }
        }

        if (bucket !== undefined && bucket !== "today" && bucket !== "next") {
            return { error: "Task bucket is invalid" }
        }

        if (estimatedMinutes !== undefined && estimatedMinutes !== null
            && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440)) {
            return { error: "Task estimate is invalid" }
        }

        const normalizedAssigneeEmail = assigneeEmail ? normalizeEmail(assigneeEmail) : undefined
        if (normalizedAssigneeEmail && !workspace.members?.some((member: { email?: string }) => (
            typeof member.email === "string" && normalizeEmail(member.email) === normalizedAssigneeEmail
        ))) {
            return { error: "Task assignee must be a workspace member" }
        }

        const taskId = `task:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const task: Task = {
            id: taskId,
            title: title.trim(),
            description: description?.trim(),
            completed: false,
            status: "todo",
            priority,
            dueDate,
            bucket,
            estimatedMinutes: estimatedMinutes ?? undefined,
            assigneeEmail: normalizedAssigneeEmail,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            workspaceId,
            createdBy: session.email
        }

        // Batch Redis operations for performance
        const timestamp = Date.now().toString()

        await Promise.all([
            redis.set(taskId, JSON.stringify(task)),
            redis.sadd(`workspace:${workspaceId}:tasks`, taskId),
            redis.set(`workspace:${workspaceId}:lastUpdate`, timestamp)
        ])

        // Publish real-time event (non-blocking)
        realtimeService.publishEvent({
            type: 'task-created',
            workspaceId,
            userId: session.email,
            timestamp: Date.now(),
            data: { task }
        }).catch(error => {
            console.error('[Realtime] Failed to publish task-created event:', error)
        })
        void recordUsageEvent(workspaceId, session.email, "task-created")

        revalidatePath('/dashboard')
        return { success: true, task }
    } catch (error) {
        console.error("Add task error:", error)
        return { error: "Failed to create task" }
    }
}

export async function updateTask(taskId: string, updates: TaskUpdate, expectedUpdatedAt?: string) {
    try {
        const session = await getSession()
        if (!session) {
            return { error: "Authentication required" }
        }

        const normalizedResult = normalizeTaskUpdates(updates)
        if (!normalizedResult.updates) {
            return { error: normalizedResult.error }
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

        const task = normalizeTask(typeof existingTask === 'string' ? JSON.parse(existingTask) : existingTask as Task)
        if (hasTaskConflict(task.updatedAt, expectedUpdatedAt)) {
            return { error: "Task changed by another teammate", task }
        }

        if (normalizedResult.updates.assigneeEmail) {
            const workspace = await validateWorkspaceMembership(session.email, task.workspaceId)
            const isMember = workspace.members?.some((member: { email?: string }) => (
                typeof member.email === "string"
                && normalizeEmail(member.email) === normalizeEmail(normalizedResult.updates?.assigneeEmail || "")
            ))
            if (!isMember) {
                return { error: "Task assignee must be a workspace member", task }
            }
        }

        const status: TaskStatus = normalizedResult.updates.status ?? task.status ?? (task.completed ? "done" : "todo")
        const updatedTask = {
            ...task,
            ...normalizedResult.updates,
            status,
            completed: status === "done",
            updatedAt: new Date().toISOString()
        }

        // Batch Redis operations
        const timestamp = Date.now().toString()

        await Promise.all([
            redis.set(taskId, JSON.stringify(updatedTask)),
            redis.set(`workspace:${task.workspaceId}:lastUpdate`, timestamp)
        ])

        // Publish real-time event (non-blocking)
        realtimeService.publishEvent({
            type: 'task-updated',
            workspaceId: task.workspaceId,
            userId: session.email,
            timestamp: Date.now(),
            data: { task: updatedTask, updates: normalizedResult.updates }
        }).catch(error => {
            console.error('[Realtime] Failed to publish task-updated event:', error)
        })
        if (!task.completed && updatedTask.completed) {
            void recordUsageEvent(task.workspaceId, session.email, "task-completed")
        }

        revalidatePath('/dashboard')
        return { success: true, task: updatedTask }
    } catch (error) {
        console.error("Update task error:", error)
        return { error: "Failed to update task" }
    }
}

export async function deleteTask(taskId: string, expectedUpdatedAt?: string) {
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

        const task = normalizeTask(typeof existingTask === 'string' ? JSON.parse(existingTask) : existingTask as Task)
        if (hasTaskConflict(task.updatedAt, expectedUpdatedAt)) {
            return { error: "Task changed by another teammate", task }
        }

        // Batch Redis operations
        const timestamp = Date.now().toString()

        await Promise.all([
            redis.del(taskId),
            redis.srem(`workspace:${task.workspaceId}:tasks`, taskId),
            redis.set(`workspace:${task.workspaceId}:lastUpdate`, timestamp)
        ])

        // Publish real-time event (non-blocking)
        realtimeService.publishEvent({
            type: 'task-deleted',
            workspaceId: task.workspaceId,
            userId: session.email,
            timestamp: Date.now(),
            data: { taskId, task }
        }).catch(error => {
            console.error('[Realtime] Failed to publish task-deleted event:', error)
        })

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error("Delete task error:", error)
        return { error: "Failed to delete task" }
    }
}

export async function toggleTask(taskId: string, expectedUpdatedAt?: string) {
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

        const task = normalizeTask(typeof existingTask === 'string' ? JSON.parse(existingTask) : existingTask as Task)
        if (hasTaskConflict(task.updatedAt, expectedUpdatedAt)) {
            return { error: "Task changed by another teammate", task }
        }
        const status: TaskStatus = task.status === "done" ? "todo" : "done"
        const updatedTask = {
            ...task,
            status,
            completed: status === "done",
            updatedAt: new Date().toISOString()
        }

        // Batch Redis operations
        const timestamp = Date.now().toString()

        await Promise.all([
            redis.set(taskId, JSON.stringify(updatedTask)),
            redis.set(`workspace:${task.workspaceId}:lastUpdate`, timestamp)
        ])

        // Publish real-time event (non-blocking)
        realtimeService.publishEvent({
            type: 'task-toggled',
            workspaceId: task.workspaceId,
            userId: session.email,
            timestamp: Date.now(),
            data: { task: updatedTask }
        }).catch(error => {
            console.error('[Realtime] Failed to publish task-toggled event:', error)
        })
        if (updatedTask.completed) {
            void recordUsageEvent(task.workspaceId, session.email, "task-completed")
        }

        revalidatePath('/dashboard')
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

        // Get all tasks in parallel
        const tasks: Task[] = []
        const taskPromises = taskIds.map(async (taskId: string) => {
            const taskData = await redis.get(taskId)
            if (taskData) {
                const task = typeof taskData === 'string' ? JSON.parse(taskData) : taskData
                tasks.push(normalizeTask(task))
            }
        })
        await Promise.all(taskPromises)

        // Sort by creation date (newest first)
        tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        return { success: true, tasks }
    } catch (error) {
        console.error("Get tasks error:", error)
        return { error: "Failed to load tasks" }
    }
}

export async function assignTask(taskId: string, assigneeEmail: string, expectedUpdatedAt?: string) {
    return updateTask(taskId, { assigneeEmail: assigneeEmail || undefined }, expectedUpdatedAt)
}
