import { toDomainCommandId } from "./command-identity.ts"
import { resourceIdSchema, platformContracts } from "./contracts.ts"
import type { CommandResult, PlatformError, PlatformToolName, QueryResult } from "./contracts.ts"
import { discoverCapabilities, getPlatformCapability } from "./capabilities.ts"

export interface PlatformPrincipal {
  userId: string
  clientId: string
  grantId: string
  capabilities: readonly string[]
  workspaceIds: readonly string[] | null
}
export interface HandlerContext { input: Record<string, unknown>; principal: PlatformPrincipal }
export interface HandlerResult { data: unknown; version?: number | null }
export type PlatformHandler = (context: HandlerContext) => Promise<HandlerResult>
export type PlatformHandlers = Partial<Record<PlatformToolName, PlatformHandler>>
export interface ReceiptExecution<T> {
  actorId: string
  clientId: string
  commandId: string
  commandType: string
  input: unknown
  workspaceId?: string
  authorize: () => Promise<void>
  execute: () => Promise<T>
}
export interface ExecutorDependencies {
  handlers: PlatformHandlers
  revalidate: (principal: PlatformPrincipal, name: PlatformToolName, input: Record<string, unknown>) => Promise<PlatformPrincipal | void>
  executeWithReceipt: <T>(args: ReceiptExecution<T>) => Promise<{ result: T; replayed: boolean }>
}
type Result = QueryResult<unknown> | CommandResult<unknown>
const messages: Record<PlatformError["code"], string> = {
  invalid_input: "The request is invalid.", unauthenticated: "Sign in to continue.", forbidden: "This operation is outside your current access.",
  not_found: "This record is unavailable.", version_conflict: "The record changed. Read its current version before applying this change.",
  invalid_state: "This operation is unavailable in the current state.", dependency_cycle: "This connection would create a dependency cycle.",
  rate_limited: "Too many requests. Try again later.", unavailable: "The result could not be confirmed. Reconcile before retrying the same command.",
  unsupported: "This capability is not available.", command_conflict: "This command identifier was already used for a different request.",
  lease_conflict: "Another run currently holds this task claim.", lease_expired: "The execution claim expired. Read the current run before continuing.", stale_fence: "This run no longer holds the current execution claim.",
}
function failure(error: unknown): PlatformError {
  const candidate = error as { code?: string; retryAfterSeconds?: number }
  const aliases: Record<string, PlatformError["code"]> = { validation: "invalid_input", conflict: "version_conflict" }
  const code = candidate?.code && (aliases[candidate.code] ?? (Object.hasOwn(messages, candidate.code) ? candidate.code as PlatformError["code"] : undefined)) || "unavailable"
  return { code, message: messages[code], ...(code === "rate_limited" && Number.isInteger(candidate.retryAfterSeconds) && candidate.retryAfterSeconds! >= 0 ? { retryAfterSeconds: candidate.retryAfterSeconds } : {}) }
}
function deny(code: PlatformError["code"]): never { throw Object.assign(new Error(messages[code]), { code }) }
function enforceScope(principal: PlatformPrincipal, name: PlatformToolName, input: Record<string, unknown>) {
  const capability = getPlatformCapability(name)
  if (!capability?.available || !capability.requiredScopes.every(scope => principal.capabilities.includes(scope))) deny("forbidden")
  if (typeof input.workspaceId === "string" && principal.workspaceIds !== null && !principal.workspaceIds.includes(input.workspaceId)) deny("forbidden")
}

/** Transport-independent dispatch. Only verified adapters may supply the principal. */
export function createPlatformExecutor(dependencies: ExecutorDependencies) {
  return {
    listTools(principal: PlatformPrincipal) {
      return discoverCapabilities({ scopes: principal.capabilities }).filter(capability => Boolean(dependencies.handlers[capability.name as PlatformToolName]))
    },
    async call(principal: PlatformPrincipal, name: string, rawInput: unknown): Promise<Result> {
      const capability = getPlatformCapability(name)
      const contract = platformContracts[name as PlatformToolName]
      const handler = dependencies.handlers[name as PlatformToolName]
      const commandId = rawInput && typeof rawInput === "object" && resourceIdSchema.safeParse((rawInput as Record<string, unknown>).commandId).success
        ? String((rawInput as Record<string, unknown>).commandId) : undefined
      const mutation = capability?.kind === "mutate" && commandId !== undefined
      try {
        if (!contract || !handler || !capability?.available) deny("unsupported")
        const parsed = contract.input.safeParse(rawInput)
        if (!parsed.success) deny("invalid_input")
        const input = parsed.data as Record<string, unknown>
        enforceScope(principal, name as PlatformToolName, input)
        if (capability.kind === "read") {
          const current = await dependencies.revalidate(principal, name as PlatformToolName, input) ?? principal
          enforceScope(current, name as PlatformToolName, input)
          const output = await handler({ input, principal: current })
          return contract.output.parse({ state: "ok", data: output.data }) as Result
        }
        if (!commandId) deny("invalid_input")
        let current = principal
        const outcome = await dependencies.executeWithReceipt({
          actorId: principal.userId, clientId: principal.clientId, commandId, commandType: name, input,
          ...(typeof input.workspaceId === "string" ? { workspaceId: input.workspaceId } : {}),
          authorize: async () => {
            current = await dependencies.revalidate(principal, name as PlatformToolName, input) ?? principal
            enforceScope(current, name as PlatformToolName, input)
          },
          execute: async () => {
            const domainInput = { ...input, commandId: toDomainCommandId(principal.userId, principal.clientId, commandId) }
            const result = await handler({ input: domainInput, principal: current })
            // Validate within the receipt transaction: invalid output cannot commit.
            return contract.output.parse({ state: "committed", commandId, version: result.version ?? null, data: result.data }) as Result
          },
        })
        return outcome.result.state === "committed" ? { ...outcome.result, replayed: outcome.replayed } : outcome.result
      } catch (error) {
        const publicError = failure(error)
        if (!mutation) return { state: "error", error: publicError }
        if (publicError.code === "version_conflict") return { state: "conflict", commandId, currentVersion: null, error: { ...publicError, code: "version_conflict" } }
        return { state: publicError.code === "unavailable" ? "unconfirmed" : "rejected", commandId, error: publicError }
      }
    },
  }
}
