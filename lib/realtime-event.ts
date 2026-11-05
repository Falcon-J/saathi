import { z } from "zod"

export type RealtimeEventType =
    | 'task-created'
    | 'task-updated'
    | 'task-deleted'
    | 'task-toggled'
    | 'task-comment-created'
    | 'user-joined'
    | 'user-left'
    | 'workspace-created'
    | 'workspace-updated'
    | 'invitation-updated'
    | 'member-added'
    | 'member-removed'

export interface RealtimeEvent {
    type: RealtimeEventType
    workspaceId: string
    userId: string
    timestamp: number
    data: Record<string, unknown>
}

export interface RealtimeStreamEvent extends RealtimeEvent {
    id: string
    publishedAt?: number
}

const realtimeEventSchema = z.object({
    type: z.enum([
        'task-created',
        'task-updated',
        'task-deleted',
        'task-toggled',
        'task-comment-created',
        'user-joined',
        'user-left',
        'workspace-created',
        'workspace-updated',
        'invitation-updated',
        'member-added',
        'member-removed',
    ]),
    workspaceId: z.string().trim().min(1).max(200),
    userId: z.string().trim().min(1).max(255),
    timestamp: z.number().int().nonnegative(),
    data: z.record(z.string(), z.unknown()),
}).strict()

export function normalizeRealtimeEvent(input: unknown): RealtimeEvent {
    const result = realtimeEventSchema.safeParse(input)
    if (!result.success) {
        throw new Error("Realtime event is invalid")
    }

    return result.data
}
