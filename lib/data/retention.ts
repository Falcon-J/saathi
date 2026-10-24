import { getDb } from "../db/client.ts"

/** Transport copies only. Domain history, receipts and unpublished obligations are retained. */
export async function deleteExpiredPublishedOutbox(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const rows = await getDb()`DELETE FROM outbox_events WHERE id IN (
    SELECT id FROM outbox_events WHERE published_at < ${cutoff}
    ORDER BY published_at, id LIMIT 500
  ) AND published_at < ${cutoff} RETURNING id`
  return rows.length
}
