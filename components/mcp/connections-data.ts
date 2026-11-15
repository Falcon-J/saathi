import { z } from 'zod'
import { getDb } from '../../lib/db/client'

export interface McpConnectionRecord { id: string; clientId: string; capabilities: string[]; workspaceIds: string[] | null; expiresAt: string | null; revokedAt: string | null; expired: boolean }
export async function recordedMcpClientIds(actorId: string): Promise<Set<string>> {
  z.uuid().parse(actorId)
  const rows = await getDb()`SELECT client_id FROM platform_delegations WHERE actor_user_id=${actorId}`
  return new Set(rows.map(row => String(row.client_id)))
}
export async function listMcpConnections(actorId: string, after?: string): Promise<{ items: McpConnectionRecord[]; next: string | null }> {
  z.uuid().parse(actorId)
  if (after) z.uuid().parse(after)
  const rows = await getDb()`SELECT id,client_id,capabilities,workspace_ids,expires_at,revoked_at,COALESCE(expires_at<=now(),false) AS expired FROM platform_delegations
    WHERE actor_user_id=${actorId} AND (${after ?? null}::uuid IS NULL OR id>${after ?? null}::uuid) ORDER BY id ASC LIMIT 51`
  const items = rows.slice(0, 50).map(row => ({ id: String(row.id), clientId: String(row.client_id), capabilities: z.array(z.string()).parse(row.capabilities), workspaceIds: z.array(z.uuid()).nullable().parse(row.workspace_ids), expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null, revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null, expired: Boolean(row.expired) }))
  return { items, next: rows.length > 50 ? items[items.length - 1].id : null }
}
