import { randomUUID } from "node:crypto"
import { getDb, type Transaction } from "../db/client.ts"
import type { RealtimeEventType } from "../realtime.ts"

export async function appendDomainEvent(tx: Transaction, event: {
  workspaceId: string; actorUserId: string; type: RealtimeEventType;
  entityType: string; entityId: string; metadata?: Record<string, unknown>; payload?: Record<string, unknown>
}) {
  const id = randomUUID()
  await tx`INSERT INTO activity_events (id, workspace_id, actor_user_id, event_type, entity_type, entity_id, metadata)
    VALUES (${id}, ${event.workspaceId}, ${event.actorUserId}, ${event.type}, ${event.entityType}, ${event.entityId}, ${tx.json((event.metadata ?? {}) as never)})`
  const payload = { type: event.type, workspaceId: event.workspaceId, userId: event.actorUserId,
    timestamp: Date.now(), data: { ...event.payload, eventId: id } }
  await tx`INSERT INTO outbox_events (id, workspace_id, event_type, payload)
    VALUES (${id}, ${event.workspaceId}, ${event.type}, ${tx.json(payload as never)})`
}

/** Best effort only. A failed publication leaves the durable row for retry. */
export async function flushOutbox(workspaceId?: string): Promise<void> {
  try {
    const { realtimeService } = await import("../realtime.ts")
    await getDb().begin(async tx => {
      const rows = await tx`SELECT id, payload FROM outbox_events WHERE published_at IS NULL
        AND (${workspaceId ?? null}::uuid IS NULL OR workspace_id = ${workspaceId ?? null}::uuid)
        ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED`
      for (const row of rows) {
        try {
          await realtimeService.publishEvent(row.payload)
          await tx`UPDATE outbox_events SET published_at = now(), attempt_count = attempt_count + 1,
            last_error_category = NULL WHERE id = ${row.id}`
        } catch {
          await tx`UPDATE outbox_events SET attempt_count = attempt_count + 1,
            last_error_category = 'PUBLICATION_UNAVAILABLE' WHERE id = ${row.id}`
        }
      }
    })
  } catch {
    // A committed domain mutation stays successful if the retry worker is unavailable.
    console.warn("[Saathi] Outbox delivery deferred")
  }
}
