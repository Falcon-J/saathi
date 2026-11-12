import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from '../../lib/db/client.ts'
import { platformCapabilities } from '../platform/capabilities.ts'
import type { McpDelegation } from './auth.ts'

export interface McpDelegationInput { capabilities: string[]; workspaceIds: string[] | null; expiresAt: string | null }
const identity = z.strictObject({ userId: z.uuid(), clientId: z.string().min(1).max(200) })
const inputSchema = z.strictObject({ capabilities: z.array(z.string().min(1).max(200)).min(1).max(100), workspaceIds: z.array(z.uuid()).max(1000).nullable(), expiresAt: z.iso.datetime({ offset: true }).nullable() })
const registeredCapabilities = new Set(platformCapabilities.filter(capability => capability.available).flatMap(capability => [...capability.requiredScopes]))
function denied(): never { throw Object.assign(new Error('Delegation access denied'), { code: 'forbidden' }) }

/** Validate application permissions; these are not Supabase OIDC scopes. */
export function validateMcpDelegationInput(value: unknown, now = new Date()): McpDelegationInput {
  const input = inputSchema.parse(value)
  if (input.capabilities.some(capability => !registeredCapabilities.has(capability))) throw new Error('Unknown application capability')
  if (input.expiresAt !== null && Date.parse(input.expiresAt) <= now.getTime()) throw new Error('Delegation expiry must be in the future')
  return { capabilities: [...new Set(input.capabilities)].sort(), workspaceIds: input.workspaceIds === null ? null : [...new Set(input.workspaceIds)].sort(), expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt).toISOString() }
}
export interface McpDelegationSession {
  /** Serialize consent changes and lock the grant before any membership rows. */
  lock: (userId: string, clientId: string) => Promise<void>
  find: (userId: string, clientId: string) => Promise<McpDelegation | null>
  /** Lock membership rows during grant creation to serialize concurrent removal. */
  workspaceIds: (userId: string) => Promise<string[]>
  upsert: (userId: string, clientId: string, input: McpDelegationInput) => Promise<McpDelegation>
  revoke: (userId: string, grantId: string) => Promise<boolean>
}
export interface McpDelegationStore { transaction<T>(operation: (session: McpDelegationSession) => Promise<T>): Promise<T> }

export function createMcpDelegationService(store: McpDelegationStore) {
  return {
    async get(input: { userId: string; clientId: string }): Promise<McpDelegation | null> {
      const key = identity.parse(input)
      return store.transaction(async session => {
        const grant = await session.find(key.userId, key.clientId)
        if (!grant || grant.userId !== key.userId || grant.clientId !== key.clientId || grant.revokedAt !== null || (grant.expiresAt !== null && (!Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= Date.now()))) return null
        return grant
      })
    },
    async save(actorId: string, clientId: string, value: unknown): Promise<McpDelegation> {
      identity.parse({ userId: actorId, clientId })
      const input = validateMcpDelegationInput(value)
      return store.transaction(async session => {
        await session.lock(actorId, clientId)
        if (input.workspaceIds !== null) {
          const current = new Set(await session.workspaceIds(actorId))
          if (input.workspaceIds.some(workspaceId => !current.has(workspaceId))) denied()
        }
        return session.upsert(actorId, clientId, input)
      })
    },
    async revoke(actorId: string, grantId: string): Promise<boolean> {
      z.uuid().parse(actorId); z.uuid().parse(grantId)
      return store.transaction(session => session.revoke(actorId, grantId))
    },
  }
}

function projection(row: Record<string, unknown>): McpDelegation {
  return { id: String(row.id), userId: String(row.actor_user_id), clientId: String(row.client_id), capabilities: z.array(z.string()).parse(row.capabilities), workspaceIds: z.array(z.uuid()).nullable().parse(row.workspace_ids), expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : null, revokedAt: row.revoked_at ? new Date(row.revoked_at as string).toISOString() : null }
}
const postgresDelegationStore: McpDelegationStore = {
  async transaction<T>(operation: (session: McpDelegationSession) => Promise<T>): Promise<T> {
    return await getDb().begin(async tx => operation({
      async lock(userId, clientId) {
        // Serialize initially absent rows too: a second first-consent upsert must not
        // acquire membership locks before the first committed grant becomes visible.
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["platform-grant", userId, clientId])},0))`
        await tx`SELECT id FROM platform_delegations WHERE actor_user_id=${userId} AND client_id=${clientId} FOR UPDATE`
      },
      async find(userId, clientId) {
        const [row] = await tx`SELECT id,actor_user_id,client_id,capabilities,workspace_ids,expires_at,revoked_at FROM platform_delegations WHERE actor_user_id=${userId} AND client_id=${clientId} FOR SHARE`
        return row ? projection(row) : null
      },
      async workspaceIds(userId) {
        const rows = await tx`SELECT workspace_id FROM workspace_members WHERE user_id=${userId} FOR SHARE`
        return rows.map(row => String(row.workspace_id))
      },
      async upsert(userId, clientId, input) {
        const [row] = await tx`INSERT INTO platform_delegations(id,actor_user_id,client_id,capabilities,workspace_ids,expires_at)
          VALUES (${randomUUID()},${userId},${clientId},${tx.json(input.capabilities)},${input.workspaceIds === null ? null : tx.json(input.workspaceIds)},${input.expiresAt})
          ON CONFLICT(actor_user_id,client_id) DO UPDATE SET capabilities=EXCLUDED.capabilities,workspace_ids=EXCLUDED.workspace_ids,expires_at=EXCLUDED.expires_at,revoked_at=NULL,updated_at=now()
          RETURNING id,actor_user_id,client_id,capabilities,workspace_ids,expires_at,revoked_at`
        return projection(row)
      },
      async revoke(userId, grantId) {
        const rows = await tx`UPDATE platform_delegations SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE id=${grantId} AND actor_user_id=${userId} RETURNING id`
        return rows.length > 0
      },
    })) as T
  },
}
const service = createMcpDelegationService(postgresDelegationStore)
export const getMcpDelegation = service.get
/** Server-authenticated consent only. Caller must validate clientId against deployment allowlist. */
export const saveMcpDelegation = service.save
export const revokeMcpDelegation = service.revoke
