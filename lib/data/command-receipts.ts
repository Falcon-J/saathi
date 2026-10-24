import { createHash } from "node:crypto"
import type { Transaction } from "../db/client.ts"

export function commandHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

// Call only after locking the workspace and checking current authorization.
export async function readCommandReceipt<T>(tx: Transaction, workspaceId: string, actorId: string, commandId: string, type: string, hash: string): Promise<T | null> {
  const [row] = await tx`SELECT command_type, request_hash, result FROM command_receipts
    WHERE workspace_id=${workspaceId} AND actor_user_id=${actorId} AND command_id=${commandId}`
  if (!row) return null
  if (row.command_type !== type || row.request_hash !== hash) throw new Error("Command identifier already used with different input")
  return row.result as T
}

export async function saveCommandReceipt(tx: Transaction, workspaceId: string, actorId: string, commandId: string, type: string, hash: string, result: unknown) {
  await tx`INSERT INTO command_receipts (workspace_id,actor_user_id,command_id,command_type,request_hash,result)
    VALUES (${workspaceId},${actorId},${commandId},${type},${hash},${tx.json(result as never)})`
}
