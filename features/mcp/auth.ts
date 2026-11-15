import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { EnabledMcpConfig } from './config.ts'

export interface McpActor {
  id: string
  email: string
  emailConfirmed: boolean
  profileId: string
}
export interface McpDelegation {
  id: string
  userId: string
  clientId: string
  capabilities: readonly string[]
  /** null permits every workspace that the actor is currently authorized to access. */
  workspaceIds: readonly string[] | null
  expiresAt: string | null
  revokedAt: string | null
}
export interface McpPrincipal {
  userId: string
  clientId: string
  grantId: string
  capabilities: readonly string[]
  workspaceIds: readonly string[] | null
}
export interface McpAuthenticatorDependencies {
  keyResolver?: JWTVerifyGetKey
  admit?: (input: { userId: string; clientId: string }) => Promise<void>
  resolveActor: (input: { userId: string; accessToken: string }) => Promise<McpActor | null>
  resolveDelegation: (input: { userId: string; clientId: string }) => Promise<McpDelegation | null>
  now?: () => Date
}

export class McpAuthenticationError extends Error {
  readonly status: 401 | 403 | 429 | 503
  readonly retryAfterSeconds?: number
  constructor(status: 401 | 403 | 429 | 503 = 401, retryAfterSeconds?: number) {
    super(status === 503 ? 'MCP authorization service unavailable' : status === 429 ? 'Too many MCP requests' : status === 403 ? 'MCP application access denied' : 'MCP authentication required')
    this.name = 'McpAuthenticationError'
    this.status = status
    if (status === 429 && Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds! > 0) this.retryAfterSeconds = retryAfterSeconds
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every request revalidates live identity and delegation; DAL still checks membership. */
export function createMcpAuthenticator(config: EnabledMcpConfig, deps: McpAuthenticatorDependencies) {
  const keyResolver = deps.keyResolver ?? createRemoteJWKSet(new URL(config.jwksUrl))
  return async function authenticate(request: Request): Promise<McpPrincipal> {
    const authorization = request.headers.get('authorization')
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i)
    if (!match || match[1].length > 16384) throw new McpAuthenticationError()
    const accessToken = match[1]
    const now = deps.now?.() ?? new Date()
    let userId: string, clientId: string
    try {
      const { payload } = await jwtVerify(accessToken, keyResolver, { issuer: config.issuer, audience: config.resource, algorithms: ['ES256', 'RS256'], requiredClaims: ['exp', 'sub', 'iss', 'aud'], currentDate: now })
      if (typeof payload.sub !== 'string' || !uuid.test(payload.sub) || payload.role !== 'authenticated' || typeof payload.client_id !== 'string' || !config.clientIds.includes(payload.client_id)) throw new McpAuthenticationError()
      userId = payload.sub
      clientId = payload.client_id
    } catch { throw new McpAuthenticationError() }
    try {
      await deps.admit?.({ userId, clientId })
      const actor = await deps.resolveActor({ userId, accessToken })
      if (!actor || actor.id !== userId || actor.profileId !== userId || !actor.emailConfirmed || !actor.email.trim()) throw new McpAuthenticationError()
      const grant = await deps.resolveDelegation({ userId, clientId })
      const expiry = grant?.expiresAt == null ? null : Date.parse(grant.expiresAt)
      if (!grant || !uuid.test(grant.id) || grant.userId !== userId || grant.clientId !== clientId || grant.revokedAt !== null || (expiry !== null && (!Number.isFinite(expiry) || expiry <= now.getTime()))) throw new McpAuthenticationError(403)
      if (!Array.isArray(grant.capabilities) || grant.capabilities.some(value => typeof value !== 'string' || !value) || (grant.workspaceIds !== null && (!Array.isArray(grant.workspaceIds) || grant.workspaceIds.some(value => typeof value !== 'string' || !uuid.test(value))))) throw new McpAuthenticationError(403)
      return { userId, clientId, grantId: grant.id, capabilities: [...grant.capabilities], workspaceIds: grant.workspaceIds === null ? null : [...grant.workspaceIds] }
    } catch (error) {
      if (error instanceof McpAuthenticationError) throw error
      throw new McpAuthenticationError(503)
    }
  }
}
