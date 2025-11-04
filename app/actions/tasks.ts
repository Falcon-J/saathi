"use server"

import { redis } from "@/lib/redis"
import { getSession } from "@/lib/auth-simple"
import { SecurityService, schemas } from "@/lib/security"
import { ErrorHandler, AuthenticationError, ValidationError, NotFoundError } from "@/lib/error-handler"
// Note: Real-time broadcasting removed for simplicity

export interface Task {
  id: string
  title: string
  description?: string
  completed: boolean
  createdAt: string
  updatedAt: string
  dueDate?: string
  categories?: string[]
  assignedTo?: string
  workspaceId: string
  createdBy: string
  priority?: "low" | "medium" | "high"
}

// Helper function to validate workspace access
async function validateWorkspaceAccess(workspaceId: string, userEmail: string) {
  const workspaceData = await redis.get(`workspace:${workspaceId}`)
  if (!workspaceData) {
    throw new NotFoundError('Workspace')
  }

  let workspace
  if (typeof workspaceData === "string") {
    workspace = JSON.parse(workspaceData)
  } else {
    workspace = workspaceData
  }

  if (!SecurityService.validateWorkspaceAccess(userEmail, workspace)) {
    throw new AuthenticationError('Access denied to workspace')
  }

  return workspace
}

// Get tasks for a specific workspace
export async function getTasks(workspaceId: string): Promise<Task[]> {
  return ErrorHandler.withRetry(async () => {
    const session = await getSession()
    if (!session) {
      throw new AuthenticationError()
    }

    // Validate input
    const validWorkspaceId = SecurityService.validateInput(schemas.workspaceId, workspaceId)

    // Check workspace access
    await validateWorkspaceAccess(validWorkspaceId, session.email)

    // Rate limiting
    if (!SecurityService.checkRateLimit(session.email, 'tasks')) {
      throw new ValidationError('Rate limit exceeded for task operations')
    }

    const tasksData = await redis.get(`workspace:${validWorkspaceId}:tasks`)

    if (!tasksData) {
      return []
    }

    let tasks: Task[]
    if (Array.isArray(tasksData)) {
      tasks = tasksData
    } else if (typeof tasksData === "string") {
      tasks = JSON.parse(tasksData)
    } else if (typeof tasksData === "object") {
      tasks = (tasksData as any).result ? JSON.parse((tasksData as any).result) : []
    } else {
      return []
    }

    return Array.isArray(tasks)
      ? tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : []
  })
}

// Add task to workspace
export async function addTask(
  workspaceId: string,
  title: string,
  description?: string,
  dueDate?: string,
  categories?: string[],
  priority?: "low" | "medium" | "high"
) {
  return ErrorHandler.withRetry(async () => {
    const session = await getSession()
    if (!session) {
      throw new AuthenticationError()
    }

    // Validate inputs
    const validWorkspaceId = SecurityService.validateInput(schemas.workspaceId, workspaceId)
    const validTitle = SecurityService.validateInput(schemas.taskTitle, title)

    // Rate limiting
    if (!SecurityService.checkRateLimit(session.email, 'tasks')) {
      throw new ValidationError('Rate limit exceeded for task operations')
    }

    // Check workspace access
    await validateWorkspaceAccess(validWorkspaceId, session.email)

    const id = SecurityService.generateSecureId('task')
    const now = new Date().toISOString()

    const task: Task = {
      id,
      title: SecurityService.sanitizeHtml(validTitle),
      description: description ? SecurityService.sanitizeHtml(description) : undefined,
      completed: false,
      createdAt: now,
      updatedAt: now,
      dueDate,
      categories: categories || [],
      workspaceId: validWorkspaceId,
      createdBy: session.email,
      priority: priority || "medium"
    }

    // Get existing tasks for workspace
    const tasksData = await redis.get(`workspace:${validWorkspaceId}:tasks`)
    let tasks: Task[] = []

    if (tasksData) {
      if (Array.isArray(tasksData)) {
        tasks = tasksData
      } else if (typeof tasksData === "string") {
        tasks = JSON.parse(tasksData)
      }
    }

    // Add new task
    tasks.push(task)

    // Save back to Redis
    await redis.set(`workspace:${validWorkspaceId}:tasks`, tasks)

    // Note: Real-time broadcasting removed for simplicity
    console.log(`[Saathi] Task created: ${task.title} in workspace ${validWorkspaceId}`)

    return task
  })
}

// Toggle task completion
export async function toggleTask(workspaceId: string, id: string) {
  return ErrorHandler.withRetry(async () => {
    const session = await getSession()
    if (!session) {
      throw new AuthenticationError()
    }

    // Validate inputs
    const validWorkspaceId = SecurityService.validateInput(schemas.workspaceId, workspaceId)
    const validTaskId = SecurityService.validateInput(schemas.taskId, id)

    // Rate limiting
    if (!SecurityService.checkRateLimit(session.email, 'tasks')) {
      throw new ValidationError('Rate limit exceeded for task operations')
    }

    // Check workspace access
    await validateWorkspaceAccess(validWorkspaceId, session.email)

    const tasksData = await redis.get(`workspace:${validWorkspaceId}:tasks`)
    let tasks: Task[] = []

    if (tasksData) {
      if (Array.isArray(tasksData)) {
        tasks = tasksData
      } else if (typeof tasksData === "string") {
        tasks = JSON.parse(tasksData)
      }
    }

    const taskIndex = tasks.findIndex((t: Task) => t.id === validTaskId)
    if (taskIndex === -1) {
      throw new NotFoundError('Task')
    }

    tasks[taskIndex].completed = !tasks[taskIndex].completed
    tasks[taskIndex].updatedAt = new Date().toISOString()

    // Save back to Redis
    await redis.set(`workspace:${validWorkspaceId}:tasks`, tasks)

    // Note: Real-time broadcasting removed for simplicity
    console.log(`[Saathi] Task toggled: ${tasks[taskIndex].title} - ${tasks[taskIndex].completed ? 'completed' : 'reopened'}`)

    return tasks[taskIndex]
  })
}

// Delete task
export async function deleteTask(workspaceId: string, id: string) {
  return ErrorHandler.withRetry(async () => {
    const session = await getSession()
    if (!session) {
      throw new AuthenticationError()
    }

    // Validate inputs
    const validWorkspaceId = SecurityService.validateInput(schemas.workspaceId, workspaceId)
    const validTaskId = SecurityService.validateInput(schemas.taskId, id)

    // Rate limiting
    if (!SecurityService.checkRateLimit(session.email, 'tasks')) {
      throw new ValidationError('Rate limit exceeded for task operations')
    }

    // Check workspace access
    await validateWorkspaceAccess(validWorkspaceId, session.email)

    const tasksData = await redis.get(`workspace:${validWorkspaceId}:tasks`)
    let tasks: Task[] = []

    if (tasksData) {
      if (Array.isArray(tasksData)) {
        tasks = tasksData
      } else if (typeof tasksData === "string") {
        tasks = JSON.parse(tasksData)
      }
    }

    const taskToDelete = tasks.find((t: Task) => t.id === validTaskId)
    if (!taskToDelete) {
      throw new NotFoundError('Task')
    }

    const filtered = tasks.filter((t: Task) => t.id !== validTaskId)

    // Save back to Redis
    await redis.set(`workspace:${validWorkspaceId}:tasks`, filtered)

    // Note: Real-time broadcasting removed for simplicity
    console.log(`[Saathi] Task deleted: ${taskToDelete.title} from workspace ${validWorkspaceId}`)
  })
}

// Update task with due date and categories
export async function updateTask(workspaceId: string, id: string, updates: Partial<Task>) {
  return ErrorHandler.withRetry(async () => {
    const session = await getSession()
    if (!session) {
      throw new AuthenticationError()
    }

    // Validate inputs
    const validWorkspaceId = SecurityService.validateInput(schemas.workspaceId, workspaceId)
    const validTaskId = SecurityService.validateInput(schemas.taskId, id)

    // Sanitize title if provided
    if (updates.title) {
      updates.title = SecurityService.sanitizeHtml(updates.title)
    }

    // Rate limiting
    if (!SecurityService.checkRateLimit(session.email, 'tasks')) {
      throw new ValidationError('Rate limit exceeded for task operations')
    }

    // Check workspace access
    await validateWorkspaceAccess(validWorkspaceId, session.email)

    const tasksData = await redis.get(`workspace:${validWorkspaceId}:tasks`)
    let tasks: Task[] = []

    if (tasksData) {
      if (Array.isArray(tasksData)) {
        tasks = tasksData
      } else if (typeof tasksData === "string") {
        tasks = JSON.parse(tasksData)
      }
    }

    const taskIndex = tasks.findIndex((t: Task) => t.id === validTaskId)
    if (taskIndex === -1) {
      throw new NotFoundError('Task')
    }

    tasks[taskIndex] = {
      ...tasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }

    // Save back to Redis
    await redis.set(`workspace:${validWorkspaceId}:tasks`, tasks)

    // Note: Real-time broadcasting removed for simplicity
    console.log(`[Saathi] Task updated: ${tasks[taskIndex].title} in workspace ${validWorkspaceId}`)

    return tasks[taskIndex]
  })
}

// Assign task to a user
export async function assignTask(workspaceId: string, taskId: string, assignedTo: string) {
  return ErrorHandler.withRetry(async () => {
    const session = await getSession()
    if (!session) {
      throw new AuthenticationError()
    }

    // Validate assignedTo email
    const validAssignedTo = SecurityService.validateInput(schemas.email, assignedTo)

    return await updateTask(workspaceId, taskId, { assignedTo: validAssignedTo })
  })
}
