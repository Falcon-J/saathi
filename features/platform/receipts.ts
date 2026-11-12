import { createHash } from "node:crypto"
import { z } from "zod"
import { getDb } from "../../lib/db/client.ts"
import { getCurrentTransaction, withTransactionContext } from "../../lib/db/transaction-context.ts"

export interface ReceiptKey { actorId: string; clientId: string; commandId: string }
export interface ReceiptRecord extends ReceiptKey { commandType: string; requestHash: string; workspaceId: string | null; result: unknown }
export interface ReceiptSession {
  lock(key: ReceiptKey): Promise<void>
  find(key: ReceiptKey): Promise<ReceiptRecord | null>
  insert(receipt: ReceiptRecord): Promise<void>
}
export interface ReceiptStore { transaction<T>(operation: (session: ReceiptSession) => Promise<T>): Promise<T> }
export interface ReceiptCommand<T> extends ReceiptKey {
  commandType: string
  input: unknown
  workspaceId?: string | null
  authorize: () => Promise<void>
  execute: () => Promise<T>
  afterCommit?: (result: T) => Promise<void> | void
  authorizeReplay?: (receipt: ReceiptRecord) => Promise<void>
  projectReplay?: (receipt: ReceiptRecord) => Promise<T>
  resolveWorkspaceId?: (result: T) => string | null | Promise<string | null>
}
export class ReceiptConflictError extends Error {
  readonly code = "command_conflict"
  constructor() { super("Command identifier was already used for a different request"); this.name = "ReceiptConflictError" }
}
function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  if (typeof value !== "object" || value === null || ancestors.has(value)) throw new TypeError("Command input must be finite, acyclic JSON")
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("Command input must be plain JSON")
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return `[${Array.from(value, item => canonicalJson(item, ancestors)).join(",")}]`
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`).join(",")}}`
  } finally { ancestors.delete(value) }
}
export function hashCommandInput(input: unknown): string { return createHash("sha256").update(canonicalJson(input)).digest("hex") }
const identity = z.strictObject({ actorId: z.uuid(), clientId: z.string().min(1).max(200), commandId: z.uuid(), commandType: z.string().min(1).max(200), workspaceId: z.uuid().nullable().optional() })
/** Current delegation and domain authorization run before every receipt lookup, including replay.
 * Replay returns the historic command outcome only; it never asserts current resource state. */
export function createReceiptRunner(store: ReceiptStore) {
  return async function run<T>(command: ReceiptCommand<T>): Promise<{ result: T; replayed: boolean }> {
    identity.parse({ actorId: command.actorId, clientId: command.clientId, commandId: command.commandId, commandType: command.commandType, workspaceId: command.workspaceId })
    const key = { actorId: command.actorId, clientId: command.clientId, commandId: command.commandId }
    const requestHash = hashCommandInput({ commandType: command.commandType, workspaceId: command.workspaceId ?? null, input: command.input })
    const outcome = await store.transaction(async session => {
      await session.lock(key)
      await command.authorize()
      const prior = await session.find(key)
      if (prior) {
        if (prior.commandType !== command.commandType || prior.requestHash !== requestHash) throw new ReceiptConflictError()
        await command.authorizeReplay?.(prior)
        const result = command.projectReplay ? await command.projectReplay(prior) : prior.result as T
        return { result, replayed: true }
      }
      const result = await command.execute()
      // Reject values that PostgreSQL JSONB cannot faithfully preserve before committing domain changes.
      canonicalJson(result)
      const workspaceId = command.resolveWorkspaceId ? await command.resolveWorkspaceId(result) : command.workspaceId ?? null
      z.uuid().nullable().parse(workspaceId)
      await session.insert({ ...key, commandType: command.commandType, requestHash, workspaceId, result })
      return { result, replayed: false }
    })
    if (!outcome.replayed && command.afterCommit) {
      try { await command.afterCommit(outcome.result) }
      catch { console.warn("[Saathi] Platform post-commit delivery deferred") }
    }
    return outcome
  }
}
const postgresReceiptStore: ReceiptStore = {
  async transaction<T>(operation: (session: ReceiptSession) => Promise<T>): Promise<T> {
    // A receipt runner must own the outer commit; otherwise afterCommit could run too early.
    if (getCurrentTransaction()) throw new Error("Receipt runner requires an outer transaction boundary")
    const outcome = await getDb().begin(async tx => withTransactionContext(tx, async () => operation({
      async lock(key) {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([key.actorId, key.clientId, key.commandId])}, 0))`
      },
      async find(key) {
        const [row] = await tx`SELECT actor_user_id,client_id,command_id,command_type,request_hash,workspace_id,result FROM platform_command_receipts WHERE actor_user_id=${key.actorId} AND client_id=${key.clientId} AND command_id=${key.commandId}`
        return row ? { actorId: row.actor_user_id, clientId: row.client_id, commandId: row.command_id, commandType: row.command_type, requestHash: row.request_hash, workspaceId: row.workspace_id, result: row.result } : null
      },
      async insert(receipt) {
        await tx`INSERT INTO platform_command_receipts (actor_user_id,client_id,command_id,command_type,request_hash,workspace_id,result) VALUES (${receipt.actorId},${receipt.clientId},${receipt.commandId},${receipt.commandType},${receipt.requestHash},${receipt.workspaceId},${tx.json(JSON.parse(canonicalJson(receipt.result)))})`
      },
    })))
    return outcome as T
  },
}
/** Requires the platform_command_receipts migration; does not create schema at runtime. */
export const executeWithReceipt = createReceiptRunner(postgresReceiptStore)
