import { getDb } from "./db/client.ts"
export interface WorkspaceUsage {
  taskCreated: number
  taskCompleted: number
  memberAdded: number
  contributors: number
}

/** Cumulative activity counts; taskCompleted counts transitions into done. */
export async function getWorkspaceUsage(workspaceId: string, actorId: string): Promise<WorkspaceUsage | null> {
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const [member] = await tx`SELECT user_id FROM workspace_members
      WHERE workspace_id=${workspaceId} AND user_id=${actorId}`
    if (!member) return null
    const [row] = await tx`SELECT count(*) FILTER(WHERE event_type='task-created')::int AS created,
      count(*) FILTER(WHERE event_type IN ('task-toggled','task-updated') AND metadata->>'completed'='true')::int AS completed,
      count(*) FILTER(WHERE event_type='member-added')::int AS members,
      count(DISTINCT actor_user_id)::int AS contributors
      FROM activity_events WHERE workspace_id=${workspaceId}`
    return { taskCreated: row.created, taskCompleted: row.completed, memberAdded: row.members, contributors: row.contributors }
  })
}
