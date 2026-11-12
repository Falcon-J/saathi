import { z } from "zod"
import { accessToolSchemas } from "../access/platform.ts"
import { coordinationToolSchemas } from "../coordination/contracts.ts"

export const resourceIdSchema = z.uuid()
export const actorSchema = z.strictObject({ userId: resourceIdSchema, source: z.enum(["verified_session", "verified_token"]) })
export type PlatformActor = z.infer<typeof actorSchema>
export const errorCodeSchema = z.enum(["invalid_input", "unauthenticated", "forbidden", "not_found", "version_conflict", "invalid_state", "dependency_cycle", "rate_limited", "unavailable", "unsupported", "command_conflict", "lease_conflict", "lease_expired", "stale_fence"])
export const platformErrorSchema = z.strictObject({ code: errorCodeSchema, message: z.string().min(1).max(500), retryAfterSeconds: z.number().int().nonnegative().optional() })
export type PlatformError = z.infer<typeof platformErrorSchema>
/** Only authoritative persistence may produce committed. Transport failures are unconfirmed. */
export function commandResultSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("committed"), commandId: resourceIdSchema, version: z.number().int().positive().nullable(), replayed: z.boolean().default(false), data }),
    z.strictObject({ state: z.literal("rejected"), commandId: resourceIdSchema, error: platformErrorSchema }),
    z.strictObject({ state: z.literal("conflict"), commandId: resourceIdSchema, currentVersion: z.number().int().positive().nullable(), error: platformErrorSchema.extend({ code: z.literal("version_conflict") }) }),
    z.strictObject({ state: z.literal("unconfirmed"), commandId: resourceIdSchema, error: platformErrorSchema }),
  ])
}
export function queryResultSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("state", [z.strictObject({ state: z.literal("ok"), data }), z.strictObject({ state: z.literal("error"), error: platformErrorSchema })])
}
export type CommandResult<T> = { state: "committed"; commandId: string; version: number | null; replayed?: boolean; data: T } | { state: "rejected" | "unconfirmed"; commandId: string; error: PlatformError } | { state: "conflict"; commandId: string; currentVersion: number | null; error: PlatformError & { code: "version_conflict" } }
export type QueryResult<T> = { state: "ok"; data: T } | { state: "error"; error: PlatformError }
const id = resourceIdSchema
const text = z.string().trim().min(1).max(200)
const version = z.number().int().positive()
const workspace = { workspaceId: id }
const task = { ...workspace, taskId: id }
const write = { commandId: id, expectedVersion: version }
const create = { commandId: id, expectedVersion: z.null() }
const page = { cursor: z.string().min(1).max(2048).optional(), limit: z.number().int().min(1).max(100).default(50) }
const instant = z.iso.datetime({ offset: true })
const status = z.enum(["todo", "in-progress", "done"])
const priority = z.enum(["low", "medium", "high"])
export const workspaceRecordSchema = z.strictObject({ id, name: z.string().trim().min(1).max(100), summary: z.string().max(240).nullable(), targetAt: instant.nullable(), ownerUserId: id, version, archivedAt: instant.nullable(), timezone: z.string().min(1).max(100) })
export const taskRecordSchema = z.strictObject({ id, workspaceId: id, title: text, description: z.string().max(1000), status, priority, assigneeUserId: id.nullable(), dueDate: z.iso.date().nullable(), dueAt: instant.nullable(), estimatedMinutes: z.number().int().min(1).max(1440).nullable(), version })
const memberRecord = z.strictObject({ userId: id, displayName: text, role: z.enum(["owner", "member"]) })
const invitationRecord = z.strictObject({ id, workspaceId: id, email: z.email(), status: z.enum(["pending", "accepted", "declined", "revoked", "expired"]), expiresAt: instant })
const linkRecord = z.strictObject({ id, workspaceId: id, status: z.enum(["pending", "accepted", "revoked", "expired"]), expiresAt: instant })
const commentRecord = z.strictObject({ id, workspaceId: id, taskId: id, authorUserId: id, body: z.string().min(1).max(2000), createdAt: instant })
const activityRecord = z.strictObject({ id, workspaceId: id, actorUserId: id, action: text, resourceId: id.nullable(), createdAt: instant })
const acknowledgement = z.strictObject({ id })
function paginated<T extends z.ZodType>(item: T) { return z.strictObject({ items: z.array(item), nextCursor: z.string().min(1).max(2048).nullable() }) }
function read<I extends z.ZodType, O extends z.ZodType>(input: I, output: O) { return { input, output: queryResultSchema(output) } }
function command<I extends z.ZodType, O extends z.ZodType>(input: I, output: O) { return { input, output: commandResultSchema(output) } }
const taskFields = { title: text, description: z.string().max(1000).optional(), priority: priority.optional(), dueDate: z.iso.date().nullable().optional(), dueAt: instant.nullable().optional(), estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(), assigneeUserId: id.nullable().optional(), bucket: z.enum(["today", "next"]).optional() }
const deadlineExclusive = (value: { dueDate?: string | null; dueAt?: string | null }) => !(value.dueDate && value.dueAt)
/** Inputs are untrusted. Actor identity and grants come only from the authenticated adapter. */
export const platformContracts = {
  "workspaces.list": read(z.strictObject({ ...page, includeArchived: z.boolean().default(false) }), paginated(workspaceRecordSchema)),
  "workspaces.get": read(z.strictObject(workspace), workspaceRecordSchema),
  "workspaces.create": command(z.strictObject({ ...create, tasks: z.array(z.strictObject({ title: text, bucket: z.enum(["today", "next"]).optional(), dueDate: z.iso.date().optional(), estimatedMinutes: z.number().int().min(1).max(1440).optional() })).max(20).optional(), name: z.string().trim().min(1).max(100), summary: z.string().trim().max(240).optional(), targetDate: z.iso.date().nullable().optional(), targetAt: instant.nullable().optional(), timezone: z.string().min(1).max(100).optional() }), workspaceRecordSchema),
  "workspaces.update": command(z.strictObject({ ...write, ...workspace, changes: z.strictObject({ name: z.string().trim().min(1).max(100).optional(), summary: z.string().trim().max(240).optional(), targetDate: z.iso.date().nullable().optional(), targetAt: instant.nullable().optional(), timezone: z.string().min(1).max(100).optional() }).refine(v => Object.keys(v).length > 0) }), workspaceRecordSchema),
  "workspaces.archive": command(z.strictObject({ ...write, ...workspace }), acknowledgement),
  "workspaces.delete": command(z.strictObject({ ...write, ...workspace }), acknowledgement),
  "workspaces.transfer_ownership": command(z.strictObject({ ...write, ...workspace, newOwnerUserId: id }), workspaceRecordSchema),
  "members.list": read(z.strictObject({ ...workspace, ...page }), paginated(memberRecord)),
  "members.remove": command(z.strictObject({ ...write, ...workspace, memberUserId: id }), acknowledgement),
  "members.leave": command(z.strictObject({ ...write, ...workspace }), acknowledgement),
  "invitation_links.create": command(z.strictObject({ ...write, ...workspace }), linkRecord.extend({ token: z.string().min(32).max(512) })),
  "invitation_links.preview": read(z.strictObject({ token: z.string().min(32).max(512) }), z.strictObject({ workspaceName: text, expiresAt: instant, status: z.literal("pending") })),
  "invitation_links.accept": command(z.strictObject({ ...create, token: z.string().min(32).max(512) }), acknowledgement),
  "invitation_links.revoke": command(z.strictObject({ ...write, ...workspace, invitationId: id }), acknowledgement),
  "invitations.list": read(z.strictObject({ workspaceId: id.optional(), ...page }), paginated(invitationRecord)),
  "invitations.send": command(z.strictObject({ ...write, ...workspace, email: z.email() }), invitationRecord),
  "invitations.accept": command(z.strictObject({ ...create, invitationId: id }), acknowledgement),
  "invitations.decline": command(z.strictObject({ ...create, invitationId: id }), acknowledgement),
  "invitations.revoke": command(z.strictObject({ ...write, ...workspace, invitationId: id }), acknowledgement),
  "tasks.list": read(z.strictObject({ ...workspace, ...page, status: status.optional(), assigneeUserId: id.optional(), search: text.optional() }), paginated(taskRecordSchema)),
  "tasks.get": read(z.strictObject(task), taskRecordSchema),
  "tasks.create": command(z.strictObject({ ...create, ...workspace, ...taskFields }).refine(deadlineExclusive, "Use dueDate or dueAt"), taskRecordSchema),
  "tasks.update": command(z.strictObject({ ...write, ...task, changes: z.strictObject({ ...taskFields, title: text.optional() }).refine(v => Object.keys(v).length > 0).refine(deadlineExclusive, "Use dueDate or dueAt") }), taskRecordSchema),
  "tasks.set_status": command(z.strictObject({ ...write, ...task, status }), taskRecordSchema),
  "tasks.assign": command(z.strictObject({ ...write, ...task, assigneeUserId: id.nullable() }), taskRecordSchema),
  "tasks.delete": command(z.strictObject({ ...write, ...task }), acknowledgement),
  "dependencies.get": read(z.strictObject(workspace), z.strictObject({ workspaceId: id, edges: z.array(z.strictObject({ taskId: id, dependsOnTaskId: id })) })),
  "dependencies.add": command(z.strictObject({ ...write, ...task, dependsOnTaskId: id }).refine(v => v.taskId !== v.dependsOnTaskId, "Task cannot depend on itself"), acknowledgement),
  "dependencies.remove": command(z.strictObject({ ...write, ...task, dependsOnTaskId: id }), acknowledgement),
  "comments.list": read(z.strictObject({ ...task, ...page }), paginated(commentRecord)),
  "comments.create": command(z.strictObject({ ...write, ...task, body: z.string().trim().min(1).max(2000) }), commentRecord),
  "activity.list": read(z.strictObject({ ...workspace, ...page }), paginated(activityRecord)),
  "archives.list": read(z.strictObject(page), paginated(workspaceRecordSchema)),
  "archives.get": read(z.strictObject(workspace), workspaceRecordSchema),
  "imports.csv": command(z.strictObject({ ...write, ...workspace, csv: z.string().min(1).max(1000000) }), z.strictObject({ importedCount: z.number().int().nonnegative(), taskIds: z.array(id) })),
  "usage.get": read(z.strictObject(workspace), z.strictObject({ taskCreated: z.number().int().nonnegative(), taskCompleted: z.number().int().nonnegative(), memberAdded: z.number().int().nonnegative(), contributors: z.number().int().nonnegative() })),
  "capabilities.list": read(z.strictObject({}), z.strictObject({ capabilities: z.array(z.strictObject({ name: text, available: z.boolean() })) })),
  "agent_runs.list": read(coordinationToolSchemas["agent_runs.list"].input, coordinationToolSchemas["agent_runs.list"].data),
  "agent_runs.get": read(coordinationToolSchemas["agent_runs.get"].input, coordinationToolSchemas["agent_runs.get"].data),
  "agent_runs.claim": command(coordinationToolSchemas["agent_runs.claim"].input, coordinationToolSchemas["agent_runs.claim"].data),
  "agent_runs.start": command(coordinationToolSchemas["agent_runs.start"].input, coordinationToolSchemas["agent_runs.start"].data),
  "agent_runs.heartbeat": command(coordinationToolSchemas["agent_runs.heartbeat"].input, coordinationToolSchemas["agent_runs.heartbeat"].data),
  "agent_runs.report": command(coordinationToolSchemas["agent_runs.report"].input, coordinationToolSchemas["agent_runs.report"].data),
  "agent_runs.submit_review": command(coordinationToolSchemas["agent_runs.submit_review"].input, coordinationToolSchemas["agent_runs.submit_review"].data),
  "agent_runs.cancel": command(coordinationToolSchemas["agent_runs.cancel"].input, coordinationToolSchemas["agent_runs.cancel"].data),
  "agent_runs.release": command(coordinationToolSchemas["agent_runs.release"].input, coordinationToolSchemas["agent_runs.release"].data),
  "canvas.resources": read(accessToolSchemas["canvas.resources"].input, accessToolSchemas["canvas.resources"].data),
  "canvas.access_details": read(accessToolSchemas["canvas.access_details"].input, accessToolSchemas["canvas.access_details"].data),
  "canvas.company_create": command(accessToolSchemas["canvas.company_create"].input, accessToolSchemas["canvas.company_create"].data),
  "canvas.container_create": command(accessToolSchemas["canvas.container_create"].input, accessToolSchemas["canvas.container_create"].data),
  "canvas.workspace_attach": command(accessToolSchemas["canvas.workspace_attach"].input, accessToolSchemas["canvas.workspace_attach"].data),
  "canvas.member_add": command(accessToolSchemas["canvas.member_add"].input, accessToolSchemas["canvas.member_add"].data),
  "canvas.group_create": command(accessToolSchemas["canvas.group_create"].input, accessToolSchemas["canvas.group_create"].data),
  "canvas.group_member_set": command(accessToolSchemas["canvas.group_member_set"].input, accessToolSchemas["canvas.group_member_set"].data),
  "canvas.grant": command(accessToolSchemas["canvas.grant"].input, accessToolSchemas["canvas.grant"].data),
  "canvas.revoke": command(accessToolSchemas["canvas.revoke"].input, accessToolSchemas["canvas.revoke"].data),
  "canvas.policy_set": command(accessToolSchemas["canvas.policy_set"].input, accessToolSchemas["canvas.policy_set"].data),
  "canvas.reference_create": command(accessToolSchemas["canvas.reference_create"].input, accessToolSchemas["canvas.reference_create"].data),
} as const
export type PlatformToolName = keyof typeof platformContracts
export type PlatformInput<N extends PlatformToolName> = z.input<(typeof platformContracts)[N]["input"]>
export type PlatformOutput<N extends PlatformToolName> = z.output<(typeof platformContracts)[N]["output"]>
