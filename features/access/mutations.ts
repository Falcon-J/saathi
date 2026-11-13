import { createHash } from "node:crypto"
import { z } from "zod"
import { getDb, type Transaction } from "../../lib/db/client.ts"
import { withTransactionContext } from "../../lib/db/transaction-context.ts"
import { createWorkspaceRecord, readWorkspace, validateWorkspace } from "../../lib/data/workspaces.ts"
import { ACCESS_CAPABILITIES, capabilitySetSchema, type AccessCapability } from "./contracts.ts"
import { createAccessResolver } from "./policy.ts"
import { loadAccessSnapshot } from "./repository.ts"
import { AccessPolicyError, requireAccessIdentifier } from "./errors.ts"

const uuid = z.string().uuid()
const name = z.string().trim().min(1).max(100)
const version = z.number().int().positive()
const command = { commandId: uuid }
const companySchema = z.object({ ...command, id: uuid, name }).strict()
const containerSchema = z.object({ ...command, id: uuid, parentId: uuid, kind: z.enum(["space", "section"]), name, mode: z.enum(["inherit", "restricted"]) }).strict()
const attachSchema = z.object({ ...command, resourceId: uuid, workspaceId: uuid, parentId: uuid, mode: z.enum(["inherit", "restricted"]), expectedWorkspaceVersion: version,
  confirmMembershipRestriction: z.literal(true) }).strict()
const contextualWorkspaceSchema = z.object({ ...command, resourceId: uuid, workspaceId: uuid, parentId: uuid,
  expectedParentVersion: version, name, summary: z.string().trim().max(240).optional(), targetAt: z.string().nullable().optional(), timezone: z.string().optional() }).strict()
export type CreateWorkspaceInCanvasInput = z.input<typeof contextualWorkspaceSchema>
const memberSchema = z.object({ ...command, organizationId: uuid, userId: uuid }).strict()
const groupSchema = z.object({ ...command, id: uuid, organizationId: uuid, name }).strict()
const groupMemberSchema = z.object({ ...command, organizationId: uuid, groupId: uuid, userId: uuid, active: z.boolean(), expectedVersion: version }).strict()
const grantSchema = z.object({ ...command, id: uuid, resourceId: uuid, expectedVersion: version,
  principal: z.object({ kind: z.enum(["user", "group"]), id: uuid }).strict(), capabilities: capabilitySetSchema, expiresAt: z.iso.datetime({ offset: true }).nullable().optional() }).strict()
const revokeSchema = z.object({ ...command, grantId: uuid, resourceId: uuid, expectedVersion: version }).strict()
const policySchema = z.object({ ...command, resourceId: uuid, expectedVersion: version, mode: z.enum(["inherit", "restricted"]) }).strict()
const referenceSchema = z.object({ ...command, id: uuid, canvasResourceId: uuid, targetResourceId: uuid }).strict()
export const accessMutationSchemas = {
  "canvas.company_create": companySchema,
  "canvas.container_create": containerSchema,
  "canvas.workspace_attach": attachSchema,
  "canvas.member_add": memberSchema,
  "canvas.group_create": groupSchema,
  "canvas.group_member_set": groupMemberSchema,
  "canvas.grant": grantSchema,
  "canvas.revoke": revokeSchema,
  "canvas.policy_set": policySchema,
  "canvas.reference_create": referenceSchema,
} as const
export type AccessMutationResult = { id: string; version: number; affectedWorkspaceIds: string[]; replayed: boolean }

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) throw new AccessPolicyError("Invalid canvas access command", "validation")
  return result.data
}
async function resourceOrganization(resourceId: string, actorId: string): Promise<string> {
  requireAccessIdentifier(actorId)
  const [row] = await getDb()`SELECT organization_id FROM canvas_resources WHERE id=${resourceId}`
  if (!row) throw new AccessPolicyError("Canvas resource unavailable or access denied")
  return row.organization_id
}
async function requireCapabilities(tx: Transaction, actorId: string, ids: string[], capability: AccessCapability | AccessCapability[]) {
  const snapshot = await loadAccessSnapshot(actorId, { resourceIds: ids }, tx)
  const resolve = createAccessResolver(snapshot.graph, new Date(snapshot.asOf))
  const required = typeof capability === "string" ? [capability] : capability
  for (const id of ids) {
    const capabilities = resolve(id, { kind: "user", userId: actorId }).capabilities
    if (!required.every(value => capabilities.includes(value))) throw new AccessPolicyError("Canvas resource unavailable or access denied")
  }
  return snapshot
}
async function currentResource(tx: Transaction, resourceId: string, expectedVersion?: number) {
  const [row] = await tx`SELECT * FROM canvas_resources WHERE id=${resourceId} FOR UPDATE`
  if (!row) throw new AccessPolicyError("Canvas resource unavailable or access denied")
  if (expectedVersion !== undefined && row.version !== expectedVersion) throw new AccessPolicyError("Canvas resource changed. Refresh before saving.", "conflict")
  return row
}

/** One batch writes existing workspace version/activity/outbox obligations after access changes. */
async function publishWorkspaceChanges(tx: Transaction, actorId: string, workspaceIds: string[], operation: string) {
  if (!workspaceIds.length) return
  await tx`WITH changed AS (
    UPDATE workspaces SET version=version+1,updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 millisecond')
      WHERE id=ANY(${tx.array(workspaceIds,2950)}) RETURNING id
  ), events AS (
    INSERT INTO activity_events(id,workspace_id,actor_user_id,event_type,entity_type,entity_id,metadata)
      SELECT gen_random_uuid(),id,${actorId},'workspace-updated','workspace',id,jsonb_build_object('action',${operation}::text) FROM changed
    RETURNING id,workspace_id
  ) INSERT INTO outbox_events(id,workspace_id,event_type,payload)
    SELECT id,workspace_id,'workspace-updated',jsonb_build_object('type','workspace-updated','workspaceId',workspace_id,
      'userId',${actorId}::uuid,'timestamp',floor(extract(epoch FROM clock_timestamp())*1000),
      'data',jsonb_build_object('eventId',id,'accessChanged',true)) FROM events`
}

async function execute(actorId: string, input: { commandId: string }, options: {
  organizationId: string; resourceId: string; operation: string; affectedResourceId?: string; workspaceId?: string; createdWorkspaceId?: string
  authorize: (tx: Transaction) => Promise<void>
  write: (tx: Transaction) => Promise<{ id: string; version: number }>
}): Promise<AccessMutationResult> {
  requireAccessIdentifier(actorId)
  const hash = createHash("sha256").update(JSON.stringify({ operation: options.operation, input })).digest("hex")
  try { return await getDb().begin(async tx => {
    // Every policy writer uses the same command -> organization -> workspace lock order.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`canvas-command:${actorId}:${input.commandId}`},0))`
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`canvas-access:${options.organizationId}`},0))`
    const affected = await tx`WITH RECURSIVE descendants AS (
      SELECT id,workspace_id,ARRAY[id] AS path,0 AS depth FROM canvas_resources WHERE id=${options.affectedResourceId ?? null}::uuid
      UNION ALL SELECT r.id,r.workspace_id,d.path||r.id,d.depth+1 FROM descendants d JOIN canvas_resources r ON r.parent_id=d.id
        WHERE d.depth<16 AND NOT r.id=ANY(d.path)
    ) SELECT id FROM workspaces WHERE id IN (SELECT workspace_id FROM descendants WHERE workspace_id IS NOT NULL)
      OR id=${options.workspaceId ?? null}::uuid ORDER BY id FOR UPDATE`
    await options.authorize(tx)
    const [receipt] = await tx`SELECT request_hash,result FROM canvas_access_commands WHERE actor_user_id=${actorId} AND command_id=${input.commandId}`
    if (receipt) {
      if (receipt.request_hash !== hash) throw new AccessPolicyError("Command identifier was already used for different input", "conflict")
      return { ...receipt.result, replayed: true } as AccessMutationResult
    }
    const written = await options.write(tx)
    const existingWorkspaceIds = affected.map(row => row.id as string)
    const affectedWorkspaceIds = [...existingWorkspaceIds, ...(options.createdWorkspaceId ? [options.createdWorkspaceId] : [])]
    await publishWorkspaceChanges(tx, actorId, existingWorkspaceIds, options.operation)
    await tx`INSERT INTO canvas_access_events(id,organization_id,actor_user_id,resource_id,operation,metadata)
      VALUES (gen_random_uuid(),${options.organizationId},${actorId},${options.resourceId},${options.operation},${tx.json({ commandId: input.commandId, entityId: written.id })})`
    const result: AccessMutationResult = { ...written, affectedWorkspaceIds, replayed: false }
    await tx`INSERT INTO canvas_access_commands(actor_user_id,command_id,organization_id,request_hash,result)
      VALUES (${actorId},${input.commandId},${options.organizationId},${hash},${tx.json(result as never)})`
    return result
  }) as AccessMutationResult } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null
    if (code === "23505") throw new AccessPolicyError("This resource or command already exists. Refresh before trying again.", "conflict")
    if (code === "23503") throw new AccessPolicyError("The person, group or resource is no longer available in this company.", "validation")
    if (code === "23514" || code === "22P02") throw new AccessPolicyError("Invalid company hierarchy or access grant.", "validation")
    throw error
  }
}

export async function createCompany(actorId: string, value: z.input<typeof companySchema>): Promise<AccessMutationResult> {
  const input = parse(companySchema, value)
  return execute(actorId, input, { organizationId: input.id, resourceId: input.id, operation: "canvas-company-created",
    authorize: async tx => {
      const [existing] = await tx`SELECT id FROM canvas_resources WHERE id=${input.id}`
      if (existing) await requireCapabilities(tx, actorId, [input.id], "manage")
    },
    write: async tx => {
      await tx`INSERT INTO canvas_resources(id,organization_id,parent_id,kind,name,policy_mode,created_by_user_id)
        VALUES (${input.id},${input.id},NULL,'organization',${input.name},'restricted',${actorId})`
      await tx`INSERT INTO canvas_organizations(id,created_by_user_id) VALUES (${input.id},${actorId})`
      await tx`INSERT INTO canvas_organization_members(organization_id,user_id) VALUES (${input.id},${actorId})`
      await tx`INSERT INTO canvas_resource_grants(id,organization_id,resource_id,user_id,capabilities,created_by_user_id)
        VALUES (gen_random_uuid(),${input.id},${input.id},${actorId},${tx.array([...ACCESS_CAPABILITIES])},${actorId})`
      return { id: input.id, version: 1 }
    } })
}

export async function createCanvasContainer(actorId: string, value: z.input<typeof containerSchema>): Promise<AccessMutationResult> {
  const input = parse(containerSchema, value)
  const organizationId = await resourceOrganization(input.parentId, actorId)
  return execute(actorId, input, { organizationId, resourceId: input.id, operation: "canvas-container-created", affectedResourceId: input.parentId,
    authorize: async tx => { await requireCapabilities(tx, actorId, [input.parentId], "manage") },
    write: async tx => {
      await tx`INSERT INTO canvas_resources(id,organization_id,parent_id,kind,name,policy_mode,created_by_user_id)
        VALUES (${input.id},${organizationId},${input.parentId},${input.kind},${input.name},${input.mode},${actorId})`
      if (input.mode === "restricted") await tx`INSERT INTO canvas_resource_grants(id,organization_id,resource_id,user_id,capabilities,created_by_user_id)
        VALUES (gen_random_uuid(),${organizationId},${input.id},${actorId},${tx.array([...ACCESS_CAPABILITIES])},${actorId})`
      return { id: input.id, version: 1 }
    } })
}

export async function attachWorkspace(actorId: string, value: z.input<typeof attachSchema>): Promise<AccessMutationResult> {
  const input = parse(attachSchema, value)
  const organizationId = await resourceOrganization(input.parentId, actorId)
  return execute(actorId, input, { organizationId, resourceId: input.resourceId, operation: "canvas-workspace-attached", workspaceId: input.workspaceId,
    authorize: async tx => {
      await requireCapabilities(tx, actorId, [input.parentId], "manage")
      const [workspace] = await tx`SELECT owner_user_id,version,archived_at FROM workspaces WHERE id=${input.workspaceId}`
      if (!workspace || workspace.owner_user_id !== actorId || workspace.archived_at) throw new AccessPolicyError("Only the active workspace owner can attach this workspace")
      // Receipt replay is checked before applying the original expectation again.
      const [receipt] = await tx`SELECT command_id FROM canvas_access_commands WHERE actor_user_id=${actorId} AND command_id=${input.commandId}`
      if (!receipt && workspace.version !== input.expectedWorkspaceVersion) throw new AccessPolicyError("Workspace changed. Refresh before attaching it.", "conflict")
    },
    write: async tx => {
      await tx`INSERT INTO canvas_resources(id,organization_id,parent_id,kind,workspace_id,policy_mode,created_by_user_id)
        VALUES (${input.resourceId},${organizationId},${input.parentId},'workspace',${input.workspaceId},${input.mode},${actorId})`
      // Stored explicit grant, not an implicit owner/admin bypass.
      await tx`INSERT INTO canvas_resource_grants(id,organization_id,resource_id,user_id,capabilities,created_by_user_id)
        VALUES (gen_random_uuid(),${organizationId},${input.resourceId},${actorId},${tx.array([...ACCESS_CAPABILITIES])},${actorId})`
      return { id: input.resourceId, version: 1 }
    } })
}

/** Create and canonically place a workspace in one receipt-bearing transaction.
 * Inheritance preserves the parent's capability ceiling without granting new authority.
 */
export async function createWorkspaceInCanvas(actorId: string, value: CreateWorkspaceInCanvasInput): Promise<AccessMutationResult> {
  const input = parse(contextualWorkspaceSchema, value)
  try { validateWorkspace(input) }
  catch (error) { throw new AccessPolicyError(error instanceof Error ? error.message : "Invalid workspace details", "validation") }
  const organizationId = await resourceOrganization(input.parentId, actorId)
  return execute(actorId, input, { organizationId, resourceId: input.resourceId, operation: "canvas-workspace-created",
    workspaceId: input.workspaceId, createdWorkspaceId: input.workspaceId,
    authorize: async tx => {
      await requireCapabilities(tx, actorId, [input.parentId], ["manage", "create"])
      const parent = await currentResource(tx, input.parentId)
      if (parent.kind !== "space" && parent.kind !== "section") throw new AccessPolicyError("Choose a space or section for this workspace", "validation")
      const [receipt] = await tx`SELECT command_id FROM canvas_access_commands WHERE actor_user_id=${actorId} AND command_id=${input.commandId}`
      if (receipt) {
        // Receipts confirm historical commits only while the new workspace is still visible.
        const workspace = await readWorkspace(input.workspaceId, actorId, tx)
        const [placement] = await tx`SELECT id FROM canvas_resources WHERE id=${input.resourceId} AND workspace_id=${input.workspaceId} AND parent_id=${input.parentId}`
        if (!workspace || !placement) throw new AccessPolicyError("Workspace unavailable or access denied")
      } else if (parent.version !== input.expectedParentVersion) throw new AccessPolicyError("Canvas resource changed. Refresh before saving.", "conflict")
    },
    write: async tx => {
      await withTransactionContext(tx, () => createWorkspaceRecord(actorId, input, { id: input.workspaceId }))
      await tx`INSERT INTO canvas_resources(id,organization_id,parent_id,kind,workspace_id,policy_mode,created_by_user_id)
        VALUES (${input.resourceId},${organizationId},${input.parentId},'workspace',${input.workspaceId},'inherit',${actorId})`
      return { id: input.resourceId, version: 1 }
    } })
}

export async function addOrganizationMember(actorId: string, value: z.input<typeof memberSchema>): Promise<AccessMutationResult> {
  const input = parse(memberSchema, value)
  return execute(actorId, input, { organizationId: input.organizationId, resourceId: input.organizationId, operation: "canvas-organization-member-added", affectedResourceId: input.organizationId,
    authorize: async tx => { await requireCapabilities(tx, actorId, [input.organizationId], "manage") },
    write: async tx => {
      await tx`INSERT INTO canvas_organization_members(organization_id,user_id) VALUES (${input.organizationId},${input.userId})
        ON CONFLICT (organization_id,user_id) DO UPDATE SET revoked_at=NULL`
      return { id: input.userId, version: 1 }
    } })
}

export async function createCanvasGroup(actorId: string, value: z.input<typeof groupSchema>): Promise<AccessMutationResult> {
  const input = parse(groupSchema, value)
  return execute(actorId, input, { organizationId: input.organizationId, resourceId: input.organizationId, operation: "canvas-group-created",
    authorize: async tx => { await requireCapabilities(tx, actorId, [input.organizationId], "manage") },
    write: async tx => {
      await tx`INSERT INTO canvas_groups(id,organization_id,name,created_by_user_id) VALUES (${input.id},${input.organizationId},${input.name},${actorId})`
      return { id: input.id, version: 1 }
    } })
}

export async function setCanvasGroupMembership(actorId: string, value: z.input<typeof groupMemberSchema>): Promise<AccessMutationResult> {
  const input = parse(groupMemberSchema, value)
  return execute(actorId, input, { organizationId: input.organizationId, resourceId: input.organizationId, operation: "canvas-group-membership-changed", affectedResourceId: input.organizationId,
    authorize: async tx => {
      const references = await tx`SELECT DISTINCT resource_id FROM canvas_resource_grants WHERE organization_id=${input.organizationId} AND group_id=${input.groupId} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>statement_timestamp())`
      // Root administration alone cannot add itself to a group that opens a restricted child.
      await requireCapabilities(tx, actorId, [input.organizationId, ...references.map(row => row.resource_id as string)], "manage")
    },
    write: async tx => {
      const [group] = await tx`UPDATE canvas_groups SET version=version+1 WHERE id=${input.groupId} AND organization_id=${input.organizationId} AND version=${input.expectedVersion} RETURNING version`
      if (!group) throw new AccessPolicyError("Group changed. Refresh before saving.", "conflict")
      await tx`INSERT INTO canvas_group_members(organization_id,group_id,user_id,revoked_at)
        VALUES (${input.organizationId},${input.groupId},${input.userId},CASE WHEN ${input.active} THEN NULL ELSE clock_timestamp() END)
        ON CONFLICT (organization_id,group_id,user_id) DO UPDATE SET revoked_at=EXCLUDED.revoked_at`
      return { id: input.groupId, version: group.version }
    } })
}

export async function grantCanvasAccess(actorId: string, value: z.input<typeof grantSchema>): Promise<AccessMutationResult> {
  const input = parse(grantSchema, value)
  const organizationId = await resourceOrganization(input.resourceId, actorId)
  return execute(actorId, input, { organizationId, resourceId: input.resourceId, operation: "canvas-access-granted", affectedResourceId: input.resourceId,
    authorize: async tx => { await requireCapabilities(tx, actorId, [input.resourceId], "manage") },
    write: async tx => {
      await currentResource(tx, input.resourceId, input.expectedVersion)
      const [expiry] = await tx`SELECT (${input.expiresAt ?? null}::timestamptz IS NULL OR ${input.expiresAt ?? null}::timestamptz>clock_timestamp()) AS future`
      if (!expiry.future) throw new AccessPolicyError("Grant expiry must be in the future", "validation")
      await tx`INSERT INTO canvas_resource_grants(id,organization_id,resource_id,user_id,group_id,capabilities,expires_at,created_by_user_id)
        VALUES (${input.id},${organizationId},${input.resourceId},${input.principal.kind === "user" ? input.principal.id : null},
          ${input.principal.kind === "group" ? input.principal.id : null},${tx.array(input.capabilities)},${input.expiresAt ?? null},${actorId})`
      await tx`UPDATE canvas_resources SET version=version+1,updated_at=clock_timestamp() WHERE id=${input.resourceId}`
      return { id: input.id, version: input.expectedVersion + 1 }
    } })
}

export async function revokeCanvasGrant(actorId: string, value: z.input<typeof revokeSchema>): Promise<AccessMutationResult> {
  const input = parse(revokeSchema, value)
  const organizationId = await resourceOrganization(input.resourceId, actorId)
  return execute(actorId, input, { organizationId, resourceId: input.resourceId, operation: "canvas-access-revoked", affectedResourceId: input.resourceId,
    authorize: async tx => { await requireCapabilities(tx, actorId, [input.resourceId], "manage") },
    write: async tx => {
      await currentResource(tx, input.resourceId, input.expectedVersion)
      const changed = await tx`UPDATE canvas_resource_grants SET revoked_at=clock_timestamp(),version=version+1
        WHERE id=${input.grantId} AND resource_id=${input.resourceId} AND revoked_at IS NULL RETURNING id`
      if (!changed.length) throw new AccessPolicyError("Grant changed. Refresh before saving.", "conflict")
      await tx`UPDATE canvas_resources SET version=version+1,updated_at=clock_timestamp() WHERE id=${input.resourceId}`
      return { id: input.grantId, version: input.expectedVersion + 1 }
    } })
}

export async function setCanvasResourcePolicy(actorId: string, value: z.input<typeof policySchema>): Promise<AccessMutationResult> {
  const input = parse(policySchema, value)
  const organizationId = await resourceOrganization(input.resourceId, actorId)
  return execute(actorId, input, { organizationId, resourceId: input.resourceId, operation: "canvas-policy-changed", affectedResourceId: input.resourceId,
    authorize: async tx => { await requireCapabilities(tx, actorId, [input.resourceId], "manage") },
    write: async tx => {
      const resource = await currentResource(tx, input.resourceId, input.expectedVersion)
      if (resource.kind === "organization" && input.mode !== "restricted") throw new AccessPolicyError("Company root policy must remain restricted", "validation")
      const snapshot = await loadAccessSnapshot(actorId, { resourceIds: [input.resourceId] }, tx)
      const future = { ...snapshot.graph, resources: snapshot.graph.resources.map(row => row.id === input.resourceId ? { ...row, mode: input.mode } : row) }
      if (!createAccessResolver(future, new Date(snapshot.asOf))(input.resourceId, { kind: "user", userId: actorId }).capabilities.includes("manage")) {
        throw new AccessPolicyError("Grant yourself explicit management access before restricting this section", "validation")
      }
      await tx`UPDATE canvas_resources SET policy_mode=${input.mode},version=version+1,updated_at=clock_timestamp() WHERE id=${input.resourceId}`
      return { id: input.resourceId, version: input.expectedVersion + 1 }
    } })
}

export async function createCanvasReference(actorId: string, value: z.input<typeof referenceSchema>): Promise<AccessMutationResult> {
  const input = parse(referenceSchema, value)
  const organizationId = await resourceOrganization(input.canvasResourceId, actorId)
  return execute(actorId, input, { organizationId, resourceId: input.canvasResourceId, operation: "canvas-reference-created", affectedResourceId: input.canvasResourceId,
    authorize: async tx => { await requireCapabilities(tx, actorId, [input.canvasResourceId], "edit"); await requireCapabilities(tx, actorId, [input.targetResourceId], "read") },
    write: async tx => {
      await tx`INSERT INTO canvas_references(id,organization_id,canvas_resource_id,target_resource_id,created_by_user_id)
        VALUES (${input.id},${organizationId},${input.canvasResourceId},${input.targetResourceId},${actorId})`
      return { id: input.id, version: 1 }
    } })
}
