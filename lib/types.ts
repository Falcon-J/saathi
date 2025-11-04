// Shared TypeScript interfaces and types

export interface User {
    email: string
    username: string
    createdAt: string
}

export interface Session {
    email: string
    username: string
}

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

export interface Workspace {
    id: string
    name: string
    ownerId: string
    members: WorkspaceMember[]
    createdAt: string
    updatedAt: string
}

export interface WorkspaceMember {
    email: string
    username: string
    role: 'owner' | 'member'
    joinedAt: string
}

export interface TaskUpdate {
    type: 'task-update'
    action: 'create' | 'update' | 'delete' | 'toggle'
    taskId: string
    workspaceId: string
    timestamp: number
}

export interface SSEEvent {
    type: 'connected' | 'heartbeat' | 'task-update'
    data?: any
    timestamp: number
}

// Real-time event types
export interface RealtimeEvent {
    type: 'task-created' | 'task-updated' | 'task-deleted' | 'task-toggled' | 'user-joined' | 'user-left'
    workspaceId: string
    userId: string
    timestamp: number
    data: any
}

// API Response types
export interface ApiResponse<T = any> {
    success?: boolean
    error?: string
    data?: T
}

export interface TaskResponse extends ApiResponse {
    task?: Task
}

export interface TasksResponse extends ApiResponse {
    tasks?: Task[]
}

// Form types
export interface LoginForm {
    email: string
    password: string
}

export interface SignupForm {
    email: string
    username: string
    password: string
    confirmPassword: string
}

export interface TaskForm {
    title: string
    description?: string
    priority: 'low' | 'medium' | 'high'
    dueDate?: string
    assigneeEmail?: string
}