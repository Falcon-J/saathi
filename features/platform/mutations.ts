import { createHash } from "node:crypto"
import { getDb } from "../../lib/db/client.ts"
import { getCurrentTransaction } from "../../lib/db/transaction-context.ts"
import { createWorkspaceRecord, updateWorkspaceRecord, archiveWorkspaceRecord, deleteWorkspaceRecord, transferWorkspaceOwnershipRecord, removeWorkspaceMember, readWorkspace } from "../../lib/data/workspaces.ts"
import { createTaskRecord, changeTaskRecord, getTaskRecord } from "../../lib/data/tasks.ts"
import { createTaskComment } from "../../lib/data/comments.ts"
import { changeTaskPrerequisite } from "../../lib/data/task-dependencies.ts"
import { createInvitationRecord, readInvitationRecord, respondToInvitation, createInvitationLinkRecord, acceptInvitationLinkRecord } from "../../lib/data/invitations.ts"
import { parseCsv } from "../../lib/csv.ts"
import { resolveFeatureFlags } from "../../lib/feature-flags.ts"
import { normalizeTaskUpdates } from "../../lib/task-contract.ts"
import { canChangeTask } from "../../lib/task-permission.ts"
import { assertWorkspaceAccess } from "../access/service.ts"
import type { TaskUpdate } from "../../lib/task-contract.ts"
import { platformContracts } from "./contracts.ts"
import { projectPlatformWorkspace, projectPlatformTask, projectPlatformComment } from "./queries.ts"
import type { HandlerContext, HandlerResult, PlatformHandler, PlatformHandlers } from "./executor.ts"

function fail(code: string): never { throw Object.assign(new Error(code), { code }) }
function requireGrant(context: HandlerContext, workspaceId: string) {
  if (context.principal.workspaceIds !== null && !context.principal.workspaceIds.includes(workspaceId)) fail("forbidden")
}
async function assertWorkspaceVersion(actorId: string, workspaceId: string, expectedVersion?: number) {
  const tx = getCurrentTransaction()
  if (!tx) fail("unavailable")
  const [row] = await tx`SELECT w.version,w.archived_at FROM workspaces w WHERE w.id=${workspaceId} AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=${actorId}) FOR UPDATE`
  if (!row) fail("forbidden")
  if (row.archived_at) fail("invalid_state")
  if (expectedVersion !== undefined && row.version !== expectedVersion) fail("version_conflict")
}
async function assertTaskVersion(actorId: string, workspaceId: string, taskId: string, expectedVersion: number) {
  await assertWorkspaceVersion(actorId, workspaceId)
  const tx = getCurrentTransaction()!
  const [row] = await tx`SELECT version FROM tasks WHERE id=${taskId} AND workspace_id=${workspaceId} FOR UPDATE`
  if (!row) fail("not_found")
  if (row.version !== expectedVersion) fail("version_conflict")
}
async function assertTaskCompletionAccess(actorId: string, workspaceId: string, taskId: string) {
  const tx = getCurrentTransaction()
  if (!tx) fail("unavailable")
  await assertWorkspaceAccess(actorId, workspaceId, "edit", tx)
  const [row] = await tx`SELECT w.owner_user_id,t.created_by_user_id,t.assignee_user_id FROM tasks t JOIN workspaces w ON w.id=t.workspace_id
    WHERE t.id=${taskId} AND t.workspace_id=${workspaceId}`
  if (!row || !canChangeTask({ ownerId: row.owner_user_id, creatorId: row.created_by_user_id, assigneeId: row.assignee_user_id }, actorId, "toggle")) fail("forbidden")
}
async function getActor(userId: string) {
  const [row] = await getDb()`SELECT id,email FROM auth.users WHERE id=${userId}`
  if (!row?.email) fail("unauthenticated")
  return { id: userId, email: String(row.email) }
}
async function resolveLinkWorkspace(token: string) {
  const hash = createHash("sha256").update(token).digest("hex")
  const [row] = await getDb()`SELECT workspace_id FROM workspace_invitations WHERE token_hash=${hash}`
  if (!row) fail("not_found")
  return String(row.workspace_id)
}
async function rateLimit(scope: string, limit: number, window: number) {
  const { consumeDistributedRateLimit } = await import("../../lib/rate-limit.ts")
  await consumeDistributedRateLimit(scope, limit, window)
}
const defaults = { createWorkspaceRecord, updateWorkspaceRecord, archiveWorkspaceRecord, deleteWorkspaceRecord, transferWorkspaceOwnershipRecord, removeWorkspaceMember, readWorkspace, createTaskRecord, changeTaskRecord, getTaskRecord, createTaskComment, changeTaskPrerequisite, createInvitationRecord, readInvitationRecord, respondToInvitation, createInvitationLinkRecord, acceptInvitationLinkRecord, assertWorkspaceVersion, assertTaskVersion, assertTaskCompletionAccess, getActor, resolveLinkWorkspace, rateLimit, csvImportEnabled: () => resolveFeatureFlags(process.env).csvImport }
export type PlatformMutationDependencies = typeof defaults
/** Handlers run inside executeWithReceipt's transaction. Domain DALs retain permission checks. */
export function createPlatformMutationHandlers(overrides: Partial<PlatformMutationDependencies> = {}): PlatformHandlers {
  const d = { ...defaults, ...overrides }
  const user = (c: HandlerContext) => c.principal.userId
  const wsId = (c: HandlerContext) => String(c.input.workspaceId)
  const expected = (c: HandlerContext) => Number(c.input.expectedVersion)
  async function workspace(c: HandlerContext, checkVersion = false) {
    const id = wsId(c)
    requireGrant(c, id)
    await d.assertWorkspaceVersion(user(c), id, checkVersion ? expected(c) : undefined)
    const record = await d.readWorkspace(id, user(c))
    if (!record) fail("forbidden")
    if (record.archivedAt) fail("invalid_state")
    return record
  }
  async function scopedTask(c: HandlerContext) {
    const ws = await workspace(c)
    const record = await d.getTaskRecord(user(c), ws.id, String(c.input.taskId))
    if (record.workspaceId !== ws.id) fail("forbidden")
    await d.assertTaskVersion(user(c), ws.id, record.id, expected(c))
    return { ws, record }
  }
  function taskUpdates(fields: Record<string, unknown>, ws: Awaited<ReturnType<typeof workspace>>): TaskUpdate {
    const { assigneeUserId, ...rest } = fields
    if (Object.hasOwn(fields, "assigneeUserId")) {
      const member = assigneeUserId === null ? null : ws.members.find(m => m.userId === assigneeUserId)
      if (assigneeUserId !== null && !member) fail("invalid_input")
      rest.assigneeEmail = member?.email ?? null
    }
    const normalized = normalizeTaskUpdates(rest)
    if (!normalized.updates) fail("invalid_input")
    return normalized.updates
  }
  const editTask = (fields: (c: HandlerContext) => Record<string, unknown>): PlatformHandler => async c => {
    const { ws, record } = await scopedTask(c)
    const updated = await d.changeTaskRecord(user(c), record.id, "edit", taskUpdates(fields(c), ws), expected(c))
    return { data: projectPlatformTask(updated, ws), version: updated.version ?? null }
  }
  const tombstone = (id: string): HandlerResult => ({ data: { id }, version: null })
  async function invite(c: HandlerContext) {
    const actor = await d.getActor(user(c))
    const invitation = await d.readInvitationRecord(actor, String(c.input.invitationId))
    if (!invitation) fail("not_found")
    requireGrant(c, invitation.workspaceId)
    if (c.input.workspaceId && c.input.workspaceId !== invitation.workspaceId) fail("forbidden")
    return { actor, invitation }
  }
  const respond = (action: "accepted" | "declined" | "revoked"): PlatformHandler => async c => {
    const { actor, invitation } = await invite(c)
    if (action === "revoked") await workspace(c, true)
    await d.rateLimit(`invite-response:${actor.id}`, 30, 60000)
    await d.respondToInvitation(actor, invitation.id, action)
    return tombstone(invitation.id)
  }
  const handlers: PlatformHandlers = {
    "workspaces.create": async c => {
      // A grant restricted to existing workspace IDs cannot create a new authorization boundary.
      if (c.principal.workspaceIds !== null) fail("forbidden")
      const { commandId: _commandId, expectedVersion: _version, ...input } = platformContracts["workspaces.create"].input.parse(c.input)
      const created = await d.createWorkspaceRecord(user(c), input)
      return { data: projectPlatformWorkspace(created), version: created.version }
    },
    "workspaces.update": async c => {
      const current = await workspace(c, true), changes = c.input.changes as Record<string, unknown>
      const input = { name: current.name, summary: current.summary, targetAt: current.targetAt, timezone: current.timezone, ...changes }
      if (Object.hasOwn(changes, "targetDate") && !Object.hasOwn(changes, "targetAt")) input.targetAt = changes.targetDate as string | null
      const result = await d.updateWorkspaceRecord(user(c), current.id, input, expected(c))
      return { data: projectPlatformWorkspace(result), version: result.version }
    },
    "workspaces.archive": async c => { const ws = await workspace(c, true); await d.archiveWorkspaceRecord(user(c), ws.id, expected(c)); return tombstone(ws.id) },
    "workspaces.delete": async c => { const ws = await workspace(c, true); await d.deleteWorkspaceRecord(user(c), ws.id); return tombstone(ws.id) },
    "workspaces.transfer_ownership": async c => {
      const ws = await workspace(c, true)
      await d.transferWorkspaceOwnershipRecord(user(c), ws.id, String(c.input.newOwnerUserId), expected(c))
      const updated = await d.readWorkspace(ws.id, user(c))
      if (!updated) fail("unavailable")
      return { data: projectPlatformWorkspace(updated), version: updated.version }
    },
    "tasks.create": async c => {
      const ws = await workspace(c), { commandId, expectedVersion: _version, workspaceId: _workspace, ...fields } = c.input
      const created = await d.createTaskRecord(user(c), ws.id, taskUpdates(fields, ws), String(commandId))
      return { data: projectPlatformTask(created, ws), version: created.version ?? null }
    },
    "tasks.update": editTask(c => c.input.changes as Record<string, unknown>),
    "tasks.set_status": async c => {
      const { ws, record } = await scopedTask(c)
      const current = record.status ?? (record.completed ? "done" : "todo"), target = c.input.status
      let updated = record
      if ((target === "todo" || target === "done") && current === target) {
        // A repeated explicit state is a no-op, but still requires current completion authority.
        await d.assertTaskCompletionAccess(user(c), ws.id, record.id)
      } else {
        // scopedTask holds the workspace/task locks and verifies expectedVersion. The DAL
        // toggle is safe only when its exact resulting state equals the explicit request.
        const completion = target === "done" && current !== "done" || target === "todo" && current === "done"
        updated = await d.changeTaskRecord(user(c), record.id, completion ? "toggle" : "edit",
          completion ? {} : taskUpdates({ status: target }, ws), expected(c))
      }
      return { data: projectPlatformTask(updated, ws), version: updated.version ?? null }
    },
    "tasks.assign": editTask(c => ({ assigneeUserId: c.input.assigneeUserId })),
    "tasks.delete": async c => { const { record } = await scopedTask(c); await d.changeTaskRecord(user(c), record.id, "delete", {}, expected(c)); return tombstone(record.id) },
    "comments.create": async c => { const { record } = await scopedTask(c); const comment = await d.createTaskComment(user(c), record.id, String(c.input.body), String(c.input.commandId)); return { data: projectPlatformComment(comment), version: null } },
    "members.remove": async c => {
      const ws = await workspace(c, true), member = ws.members.find(m => m.userId === c.input.memberUserId)
      if (!member) fail("invalid_input")
      await d.removeWorkspaceMember(user(c), ws.id, member.email)
      return tombstone(member.userId)
    },
    "members.leave": async c => {
      const ws = await workspace(c, true), member = ws.members.find(m => m.userId === user(c))
      if (!member) fail("forbidden")
      await d.removeWorkspaceMember(user(c), ws.id, member.email)
      return tombstone(member.userId)
    },
    "invitations.send": async c => {
      const ws = await workspace(c, true), actor = await d.getActor(user(c))
      await d.rateLimit(`invite-owner:${actor.id}`, 10, 3600000)
      const invitation = await d.createInvitationRecord(actor, ws.id, String(c.input.email), async recipient => {
        await d.rateLimit(`invite-workspace:${ws.id}`, 30, 3600000)
        await d.rateLimit(`invite-recipient:${createHash("sha256").update(recipient).digest("hex")}`, 5, 3600000)
      })
      return { data: { id: invitation.id, workspaceId: invitation.workspaceId, email: invitation.inviteeEmail, status: invitation.status, expiresAt: invitation.expiresAt }, version: null }
    },
    "invitations.accept": respond("accepted"), "invitations.decline": respond("declined"), "invitations.revoke": respond("revoked"),
    "invitation_links.revoke": respond("revoked"),
    "invitation_links.create": async c => {
      const ws = await workspace(c, true), actor = await d.getActor(user(c))
      await d.rateLimit(`invite-owner:${actor.id}`, 10, 3600000)
      const { invitation, token } = await d.createInvitationLinkRecord(actor, ws.id, () => d.rateLimit(`invite-workspace:${ws.id}`, 30, 3600000))
      return { data: { id: invitation.id, workspaceId: invitation.workspaceId, status: invitation.status, expiresAt: invitation.expiresAt, token }, version: null }
    },
    "invitation_links.accept": async c => {
      const actor = await d.getActor(user(c)), token = String(c.input.token), workspaceId = await d.resolveLinkWorkspace(token)
      requireGrant(c, workspaceId)
      await d.rateLimit(`invite-response:${actor.id}`, 30, 60000)
      const result = await d.acceptInvitationLinkRecord(actor, token)
      if (result !== workspaceId) fail("forbidden")
      return tombstone(workspaceId)
    },
    "imports.csv": async c => {
      if (!d.csvImportEnabled()) fail("unsupported")
      const ws = await workspace(c, true), csv = String(c.input.csv)
      if (new TextEncoder().encode(csv).byteLength > 512 * 1024) fail("invalid_input")
      let rows: Record<string, string>[]
      try { rows = parseCsv(csv) } catch { fail("invalid_input") }
      if (!rows.length || rows.length > 100 || !Object.hasOwn(rows[0], "title")) fail("invalid_input")
      const taskIds: string[] = []
      for (const [index, row] of rows.entries()) {
        const updates: Record<string, unknown> = { title: row.title, priority: row.priority?.toLowerCase() || "medium" }
        for (const field of ["description", "duedate", "dueat", "assigneeemail"]) if (row[field]) updates[({ duedate: "dueDate", dueat: "dueAt", assigneeemail: "assigneeEmail" } as Record<string, string>)[field] ?? field] = row[field]
        if (row.estimatedminutes) updates.estimatedMinutes = Number(row.estimatedminutes)
        const normalized = normalizeTaskUpdates(updates)
        if (!normalized.updates) fail("invalid_input")
        const digest = createHash("sha256").update(JSON.stringify([user(c), c.principal.clientId, c.input.commandId, index])).digest("hex")
        const rowCommand = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
        const task = await d.createTaskRecord(user(c), ws.id, normalized.updates, rowCommand)
        taskIds.push(task.id)
      }
      return { data: { importedCount: taskIds.length, taskIds }, version: null }
    },
  }
  for (const operation of ["add", "remove"] as const) handlers[`dependencies.${operation}`] = async c => {
    const { record } = await scopedTask(c)
    await d.getTaskRecord(user(c), wsId(c), String(c.input.dependsOnTaskId))
    const result = await d.changeTaskPrerequisite(user(c), { workspaceId: wsId(c), dependentTaskId: record.id, prerequisiteTaskId: String(c.input.dependsOnTaskId), expectedVersion: expected(c), commandId: String(c.input.commandId), operation })
    return { data: { id: record.id }, version: result.task?.version ?? null }
  }
  // Domain errors retain stable public codes; unknown infrastructure errors stay unconfirmed.
  for (const name of Object.keys(handlers) as Array<keyof PlatformHandlers>) {
    const handler = handlers[name]!
    handlers[name] = async c => {
      try { return await handler(c) }
      catch (error) {
        if (error && typeof error === "object" && "retryAfterSeconds" in error) throw Object.assign(new Error("rate_limited"), { code: "rate_limited", retryAfterSeconds: error.retryAfterSeconds })
        if (error instanceof Error && !("code" in error)) {
          const message = error.message
          if (/changed|version/i.test(message)) fail("version_conflict")
          if (/archived|transfer ownership before|no longer pending|expired/i.test(message)) fail("invalid_state")
          if (/only|access denied|verify your email|not.*member|available for your account/i.test(message)) fail("forbidden")
          if (/not found|invitation unavailable/i.test(message)) fail("not_found")
          if (/invalid|required|cannot|choose/i.test(message)) fail("invalid_input")
        }
        throw error
      }
    }
  }
  return handlers
}
