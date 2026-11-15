import { createClient } from "@supabase/supabase-js"
import { createRemoteJWKSet } from "jose"
import { getProfile } from "../../lib/data/profiles.ts"
import { readWorkspace } from "../../lib/data/workspaces.ts"
import { consumeDistributedRateLimit, RateLimitExceeded } from "../../lib/rate-limit.ts"
import { afterDomainCommit } from "../../lib/post-commit.ts"
import { getSupabaseConfig } from "../../lib/supabase/config.ts"
import { createPlatformExecutor } from "../platform/executor.ts"
import type { PlatformPrincipal, PlatformHandlers, ReceiptExecution } from "../platform/executor.ts"
import { platformContracts, type PlatformToolName } from "../platform/contracts.ts"
import { createPlatformQueryHandlers } from "../platform/queries.ts"
import { createPlatformMutationHandlers } from "../platform/mutations.ts"
import { executeWithReceipt } from "../platform/receipts.ts"
import { toDomainCommandId } from "../platform/command-identity.ts"
import { authorizePlatformReplay } from "../platform/replay-authorization.ts"
import { getPlatformCapability } from "../platform/capabilities.ts"
import { getMcpDelegation } from "./delegations.ts"
import { createMcpAuthenticator, McpAuthenticationError } from "./auth.ts"
import { resolveMcpConfig } from "./config.ts"
import { createMcpHttpHandler } from "./server.ts"
import { createAccessPlatformHandlers, authorizeAccessPlatformReplay, getAccessPlatformPostCommitWorkspaces } from "../access/platform.ts"
import { createCoordinationHandlers } from "../coordination/handlers.ts"
import { getDb } from "../../lib/db/client.ts"
import { resolveMcpActor } from "./identity.ts"

// Public signing keys may be reused; identity, delegation and membership may not.
let signingKeys: { url: string; resolver: ReturnType<typeof createRemoteJWKSet> } | undefined

function forbidden(): never { throw Object.assign(new Error("Current access is required"), { code: "forbidden" }) }
function validDelegation(grant: Awaited<ReturnType<typeof getMcpDelegation>>, principal: PlatformPrincipal) {
  if (!grant || grant.id !== principal.grantId || grant.revokedAt !== null || (grant.expiresAt !== null && Date.parse(grant.expiresAt) <= Date.now())) forbidden()
  return grant
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  try {
    const config = resolveMcpConfig()
    if (!config.enabled) return Response.json({ error: "MCP is not enabled" }, { status: 404, headers: { "cache-control": "no-store" } })
    const { url, key } = getSupabaseConfig()
    const identity = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    if (signingKeys?.url !== config.jwksUrl) signingKeys = { url: config.jwksUrl, resolver: createRemoteJWKSet(new URL(config.jwksUrl)) }
    const authenticate = createMcpAuthenticator(config, {
      keyResolver: signingKeys.resolver,
      async admit({ userId, clientId }) {
        try { await consumeDistributedRateLimit(`mcp-request:${userId}:${clientId}`, 180, 60_000) }
        catch (error) {
          if (error instanceof RateLimitExceeded) throw new McpAuthenticationError(429, error.retryAfterSeconds)
          throw error
        }
      },
      async resolveActor({ userId, accessToken }) {
        return resolveMcpActor({ userId, accessToken }, { getUser: token => identity.auth.getUser(token), getProfile })
      },
      resolveDelegation: getMcpDelegation,
    })
    const handlers: PlatformHandlers = { ...createPlatformMutationHandlers(), ...createCoordinationHandlers(), ...createAccessPlatformHandlers() }
    const executor = createPlatformExecutor({
      handlers,
      async revalidate(principal, name, input) {
        const grant = validDelegation(await getMcpDelegation({ userId: principal.userId, clientId: principal.clientId }), principal)
        const capability = getPlatformCapability(name)
        if (!capability || !capability.requiredScopes.every(value => grant.capabilities.includes(value))) forbidden()
        if (typeof input.workspaceId === "string") {
          if (grant.workspaceIds !== null && !grant.workspaceIds.includes(input.workspaceId)) forbidden()
          const workspace = await readWorkspace(input.workspaceId, principal.userId)
          // Exact actor/client receipt replay may confirm a previously deleted workspace.
          // A new delete still goes through the domain owner's authorization check.
          if (!workspace && name !== "workspaces.delete") forbidden()
        }
        if (name === "workspaces.create" && grant.workspaceIds !== null) forbidden()
        try { await consumeDistributedRateLimit(`platform:${principal.userId}:${principal.clientId}`, 120, 60_000) }
        catch (error) {
          if (error instanceof RateLimitExceeded) throw Object.assign(error, { code: "rate_limited" })
          throw error
        }
        return { ...principal, capabilities: [...grant.capabilities], workspaceIds: grant.workspaceIds === null ? null : [...grant.workspaceIds] }
      },
      async executeWithReceipt<T>(args: ReceiptExecution<T>) {
        let resolvedWorkspaceId = args.workspaceId
        return executeWithReceipt({ ...args,
          async authorizeReplay(receipt) {
            const grant = await getMcpDelegation({ userId: args.actorId, clientId: args.clientId })
            if (!grant) forbidden()
            if (receipt.workspaceId && grant.workspaceIds !== null && !grant.workspaceIds.includes(receipt.workspaceId)) forbidden()
            await authorizePlatformReplay({ actorId: args.actorId, commandType: args.commandType, workspaceId: receipt.workspaceId })
            if (!receipt.workspaceId || args.commandType === "workspaces.delete" || args.commandType === "invitations.decline") return
            if (!await readWorkspace(receipt.workspaceId, args.actorId)) forbidden()
          },
          async projectReplay(receipt) {
            if (!args.commandType.startsWith("canvas.")) return receipt.result as T
            const grant = await getMcpDelegation({ userId: args.actorId, clientId: args.clientId })
            if (!grant) forbidden()
            const data = await authorizeAccessPlatformReplay({ userId: args.actorId, clientId: args.clientId, grantId: grant.id,
              capabilities: grant.capabilities, workspaceIds: grant.workspaceIds }, args.commandType,
              { ...args.input as Record<string, unknown>, commandId: toDomainCommandId(args.actorId, args.clientId, args.commandId) }, receipt.result)
            return platformContracts[args.commandType as PlatformToolName].output.parse({ ...receipt.result as object, data }) as T
          },
          async resolveWorkspaceId(result) {
            const value = result as { state?: string; data?: { id?: string; workspaceId?: string } }
            resolvedWorkspaceId = args.workspaceId ?? value.data?.workspaceId ?? (["workspaces.create", "invitation_links.accept"].includes(args.commandType) ? value.data?.id : undefined)
            const input = args.input as Record<string, unknown>
            if (!resolvedWorkspaceId && typeof input.invitationId === "string") {
              const [invitation] = await getDb()`SELECT workspace_id FROM workspace_invitations WHERE id=${input.invitationId}`
              resolvedWorkspaceId = invitation?.workspace_id
            }
            return resolvedWorkspaceId ?? null
          },
          async afterCommit(result) {
            const value = result as { data?: { id?: string; workspaceId?: string; affectedWorkspaceIds?: string[] } }
            const workspaceId = resolvedWorkspaceId ?? value.data?.workspaceId ?? (args.commandType === "workspaces.create" ? value.data?.id : undefined)
            const affected = new Set([...(value.data?.affectedWorkspaceIds ?? []), ...(workspaceId ? [workspaceId] : [])])
            if (args.commandType.startsWith("canvas.")) {
              for (const id of await getAccessPlatformPostCommitWorkspaces(args.actorId, toDomainCommandId(args.actorId, args.clientId, args.commandId))) affected.add(id)
            }
            for (const id of affected) afterDomainCommit(id)
          },
        })
      },
    })
    Object.assign(handlers, createPlatformQueryHandlers({ listExecutableCapabilities: principal => executor.listTools(principal) }))
    return createMcpHttpHandler({ config, authenticate, executor: () => executor })(request)
  } catch {
    return Response.json({ error: "MCP configuration is unavailable" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}
