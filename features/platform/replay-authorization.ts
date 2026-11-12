import { z } from "zod"
import type { Transaction } from "../../lib/db/client.ts"
import { getCurrentTransaction } from "../../lib/db/transaction-context.ts"
import { assertWorkspaceAccess } from "../access/service.ts"

export interface ReplayAuthorizationInput { actorId: string; commandType: string; workspaceId: string | null }
export interface ReplayAuthorizationDependencies {
  getTransaction(): Transaction | undefined
  readWorkspace(tx: Transaction, workspaceId: string): Promise<{ ownerUserId: string; archivedAt: string | null } | null>
  requireManage(actorId: string, workspaceId: string, tx: Transaction): Promise<void>
}
const dependencies: ReplayAuthorizationDependencies = {
  getTransaction: getCurrentTransaction,
  async readWorkspace(tx, workspaceId) {
    const [row] = await tx`SELECT owner_user_id,archived_at FROM workspaces WHERE id=${workspaceId} FOR UPDATE`
    return row ? { ownerUserId: String(row.owner_user_id), archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null } : null
  },
  async requireManage(actorId, workspaceId, tx) { await assertWorkspaceAccess(actorId, workspaceId, "manage", tx) },
}
function denied(code: "forbidden" | "unavailable" = "forbidden"): never {
  throw Object.assign(new Error(code === "forbidden" ? "Current access is required" : "Atomic replay authorization is unavailable"), { code })
}
/** These receipts contain owner-only addresses or bearer credentials. A readable workspace
 * alone does not authorize redisclosure after ownership or section-management access changes.
 * Run inside the receipt transaction so policy writers serialize on this workspace lock. */
export async function authorizePlatformReplay(input: ReplayAuthorizationInput, policy: ReplayAuthorizationDependencies = dependencies): Promise<void> {
  if (input.commandType !== "invitation_links.create" && input.commandType !== "invitations.send") return
  if (input.workspaceId === null || !z.uuid().safeParse(input.actorId).success || !z.uuid().safeParse(input.workspaceId).success) denied()
  const tx = policy.getTransaction()
  if (!tx) denied("unavailable")
  const workspaceId = input.workspaceId
  const workspace = await policy.readWorkspace(tx, workspaceId)
  if (!workspace || workspace.ownerUserId !== input.actorId || workspace.archivedAt !== null) denied()
  await policy.requireManage(input.actorId, workspaceId, tx)
}
