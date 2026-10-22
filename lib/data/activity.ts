import { getDb, type Transaction } from "../db/client.ts"
import { z } from "zod"

export interface ActivityEvent {
  id: string
  eventType: string
  entityType: string
  entityId: string
  actorUsername: string
  actorEmail: string
  metadata: Record<string, unknown>
  createdAt: string
}

function safeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function listActivityEvents(actorId: string, workspaceId: string, limit = 50): Promise<ActivityEvent[]> {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  return (await listActivityEventsPage(actorId, workspaceId, undefined, boundedLimit)).events
}

export interface ActivityPage { events: ActivityEvent[]; nextCursor: string | null }

export async function listActivityEventsPage(actorId: string, workspaceId: string, cursor?: string, limit = 50): Promise<ActivityPage> {
  if (cursor && !z.string().uuid().safeParse(cursor).success) throw new Error("Invalid activity cursor")
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid activity page size")
  return getDb().begin("isolation level repeatable read read only", async (tx: Transaction) => {
    const [member] = await tx`SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.workspace_id = ${workspaceId} AND m.user_id = ${actorId}`
    if (!member) throw new Error("Workspace unavailable or access denied")
    if (cursor) {
      const [boundary] = await tx`SELECT id FROM activity_events WHERE id=${cursor} AND workspace_id=${workspaceId}`
      if (!boundary) throw new Error("Activity cursor unavailable")
    }

    const rows = await tx`SELECT a.id, a.event_type, a.entity_type, a.entity_id, a.metadata, a.created_at,
        p.username AS actor_username, u.email AS actor_email
      FROM activity_events a
      JOIN profiles p ON p.id = a.actor_user_id
      JOIN auth.users u ON u.id = a.actor_user_id
      WHERE a.workspace_id = ${workspaceId}
        AND (${cursor ?? null}::uuid IS NULL OR (a.created_at, a.id) <
          (SELECT created_at, id FROM activity_events WHERE id=${cursor ?? null}::uuid AND workspace_id=${workspaceId}))
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limit + 1}`

    const visible = rows.slice(0, limit)
    return { events: visible.map(row => ({
      id: row.id,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorUsername: row.actor_username,
      actorEmail: row.actor_email,
      metadata: safeMetadata(row.metadata),
      createdAt: new Date(row.created_at).toISOString(),
    })), nextCursor: rows.length > limit ? visible[visible.length - 1].id : null }
  })
}
