import { redis } from "./redis"

export type UsageEvent = "task-created" | "task-completed" | "member-added"

export interface WorkspaceUsage {
  taskCreated: number
  taskCompleted: number
  memberAdded: number
  contributors: number
}

const usageEvents: UsageEvent[] = ["task-created", "task-completed", "member-added"]

export async function recordUsageEvent(
  workspaceId: string,
  userEmail: string,
  event: UsageEvent,
): Promise<void> {
  try {
    await Promise.all([
      redis.incr(`usage:${workspaceId}:${event}`),
      redis.sadd(`usage:${workspaceId}:contributors`, userEmail),
    ])
  } catch (error) {
    // Usage measurement must never turn a successful domain mutation into a failure.
    console.error("[Usage] Failed to record usage event:", error)
  }
}

export async function getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
  const values = await Promise.all([
    ...usageEvents.map((event) => redis.get(`usage:${workspaceId}:${event}`)),
    redis.smembers(`usage:${workspaceId}:contributors`),
  ])

  return {
    taskCreated: Number(values[0] || 0),
    taskCompleted: Number(values[1] || 0),
    memberAdded: Number(values[2] || 0),
    contributors: (values[3] as string[]).length,
  }
}
