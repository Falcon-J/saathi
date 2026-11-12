import { z } from "zod"
import { accessMutationSchemas } from "./mutations.ts"
import { capabilitySetSchema, canvasReferenceSchema, type AccessCapability } from "./contracts.ts"
import { AccessPolicyError, getAuthorizedCanvasView, getCanvasAccessDetails, createCompany, createCanvasContainer,
  attachWorkspace, addOrganizationMember, createCanvasGroup, setCanvasGroupMembership, grantCanvasAccess, revokeCanvasGrant,
  setCanvasResourcePolicy, createCanvasReference,
  filterVisibleAccessMutationResult, type AuthorizedCanvasResource, type AccessMutationResult } from "./service.ts"
import { getDb } from "../../lib/db/client.ts"
import { loadAccessSnapshot } from "./repository.ts"
import { createAccessResolver } from "./policy.ts"
export { getAccessPlatformPostCommitWorkspaces } from "./service.ts"
import type { PlatformHandler, PlatformPrincipal } from "../platform/executor.ts"

const uuid = z.uuid()
const version = z.number().int().positive()
const instant = z.iso.datetime({ offset: true }).nullable()
const resource = z.strictObject({ id: uuid, organizationId: uuid, parentId: uuid.nullable(), kind: z.enum(["organization", "space", "section", "workspace"]),
  name: z.string().min(1).max(100), workspaceId: uuid.nullable(), mode: z.enum(["inherit", "restricted"]), version, capabilities: capabilitySetSchema })
const mutationData = z.strictObject({ id: uuid, version, affectedWorkspaceIds: z.array(uuid).max(10_000), replayed: z.boolean() })
const details = z.strictObject({ resource,
  grants: z.array(z.strictObject({ id: uuid, principal: z.strictObject({ kind: z.enum(["user", "group"]), id: uuid, label: z.string().min(1).max(100) }),
    capabilities: capabilitySetSchema, version, expiresAt: instant, revokedAt: instant })).max(10_000),
  members: z.array(z.strictObject({ id: uuid, label: z.string().min(1).max(100) })).max(10_000),
  groups: z.array(z.strictObject({ id: uuid, name: z.string().min(1).max(100), version, memberIds: z.array(uuid).max(10_000) })).max(10_000),
})
function mutation<I extends z.ZodType>(input: I, destructive = false, securitySensitive = true) {
  return { input, data: mutationData, kind: "mutate" as const, destructive, securitySensitive }
}
/** Raw data contracts; the shared platform wraps its own command/query result envelopes. */
export const accessToolSchemas = {
  "canvas.resources": { input: z.strictObject({}), data: z.strictObject({ resources: z.array(resource).max(10_000), references: z.array(canvasReferenceSchema).max(50_000) }), kind: "read" as const, destructive: false, securitySensitive: false },
  "canvas.access_details": { input: z.strictObject({ resourceId: uuid }), data: details, kind: "read" as const, destructive: false, securitySensitive: true },
  "canvas.company_create": mutation(accessMutationSchemas["canvas.company_create"]),
  "canvas.container_create": mutation(accessMutationSchemas["canvas.container_create"]),
  "canvas.workspace_attach": mutation(accessMutationSchemas["canvas.workspace_attach"], true),
  "canvas.member_add": mutation(accessMutationSchemas["canvas.member_add"]),
  "canvas.group_create": mutation(accessMutationSchemas["canvas.group_create"]),
  "canvas.group_member_set": mutation(accessMutationSchemas["canvas.group_member_set"], true),
  "canvas.grant": mutation(accessMutationSchemas["canvas.grant"]),
  "canvas.revoke": mutation(accessMutationSchemas["canvas.revoke"], true),
  "canvas.policy_set": mutation(accessMutationSchemas["canvas.policy_set"], true),
  "canvas.reference_create": mutation(accessMutationSchemas["canvas.reference_create"], false, false),
} as const

function requireGlobalManagement(principal: PlatformPrincipal): void {
  if (principal.workspaceIds !== null) throw new AccessPolicyError("Global canvas management is outside this application scope")
}
function validated<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new AccessPolicyError("Invalid canvas access command", "validation")
  return parsed.data
}
/** A selected-workspace application can see readable canonical ancestors, never sibling branches. */
export function scopeCanvasResources(resources: AuthorizedCanvasResource[], workspaceIds: readonly string[] | null): AuthorizedCanvasResource[] {
  if (workspaceIds === null) return resources
  const selected = new Set(workspaceIds)
  const records = new Map(resources.map(resource => [resource.id, resource]))
  const visible = new Set<string>()
  for (const resource of resources) {
    if (!resource.workspaceId || !selected.has(resource.workspaceId)) continue
    let cursor: AuthorizedCanvasResource | undefined = resource
    while (cursor && !visible.has(cursor.id)) {
      visible.add(cursor.id)
      cursor = cursor.parentId ? records.get(cursor.parentId) : undefined
    }
  }
  return resources.filter(resource => visible.has(resource.id))
}

const defaults = { getAuthorizedCanvasView, getCanvasAccessDetails, createCompany, createCanvasContainer, attachWorkspace,
  addOrganizationMember, createCanvasGroup, setCanvasGroupMembership, grantCanvasAccess, revokeCanvasGrant,
  setCanvasResourcePolicy, createCanvasReference, filterVisibleAccessMutationResult }

export function createAccessPlatformHandlers(overrides: Partial<typeof defaults> = {}): Record<string, PlatformHandler> {
  const dal = { ...defaults, ...overrides }
  const wrap = <S extends z.ZodType>(schema: S, execute: (actorId: string, input: z.output<S>) => Promise<AccessMutationResult>): PlatformHandler => async context => {
    requireGlobalManagement(context.principal)
    const result = await execute(context.principal.userId, validated(schema, context.input))
    return { data: await dal.filterVisibleAccessMutationResult(context.principal.userId, result), version: result.version }
  }
  return {
    "canvas.resources": async context => {
      validated(accessToolSchemas["canvas.resources"].input, context.input)
      const view = await dal.getAuthorizedCanvasView(context.principal.userId)
      const resources = scopeCanvasResources(view.resources, context.principal.workspaceIds)
      const visible = new Set(resources.map(resource => resource.id))
      return { data: { resources, references: view.references.filter(reference => visible.has(reference.canvasResourceId) && visible.has(reference.targetResourceId)) } }
    },
    "canvas.access_details": async context => {
      requireGlobalManagement(context.principal)
      const input = validated(accessToolSchemas["canvas.access_details"].input, context.input)
      return { data: await dal.getCanvasAccessDetails(context.principal.userId, input.resourceId) }
    },
    "canvas.company_create": wrap(accessMutationSchemas["canvas.company_create"], dal.createCompany),
    "canvas.container_create": wrap(accessMutationSchemas["canvas.container_create"], dal.createCanvasContainer),
    "canvas.workspace_attach": wrap(accessMutationSchemas["canvas.workspace_attach"], dal.attachWorkspace),
    "canvas.member_add": wrap(accessMutationSchemas["canvas.member_add"], dal.addOrganizationMember),
    "canvas.group_create": wrap(accessMutationSchemas["canvas.group_create"], dal.createCanvasGroup),
    "canvas.group_member_set": wrap(accessMutationSchemas["canvas.group_member_set"], dal.setCanvasGroupMembership),
    "canvas.grant": wrap(accessMutationSchemas["canvas.grant"], dal.grantCanvasAccess),
    "canvas.revoke": wrap(accessMutationSchemas["canvas.revoke"], dal.revokeCanvasGrant),
    "canvas.policy_set": wrap(accessMutationSchemas["canvas.policy_set"], dal.setCanvasResourcePolicy),
    "canvas.reference_create": wrap(accessMutationSchemas["canvas.reference_create"], dal.createCanvasReference),
  }
}

/** Call ONLY when returning a historical canvas mutation receipt, after refreshing the app grant.
 * Passing the stored raw data (or its platform envelope) returns a freshly privacy-filtered copy.
 */
export async function authorizeAccessPlatformReplay(principal: PlatformPrincipal, name: string, input: Record<string, unknown>, result?: unknown): Promise<AccessMutationResult | undefined> {
  requireGlobalManagement(principal)
  if (!Object.hasOwn(accessMutationSchemas, name)) throw new AccessPolicyError("Invalid canvas replay capability", "validation")
  const schema = accessMutationSchemas[name as keyof typeof accessMutationSchemas]
  if (!schema) throw new AccessPolicyError("Invalid canvas replay capability", "validation")
  const parsed = validated(schema, input) as Record<string, unknown>
  const field = (key: string) => String(parsed[key])
  const requirements: Array<{ id: string; capability: AccessCapability }> = []
  const need = (id: string, capability: AccessCapability = "manage") => requirements.push({ id, capability })
  switch (name) {
    case "canvas.company_create": need(field("id")); break
    case "canvas.container_create": need(field("parentId")); need(field("id")); break
    case "canvas.workspace_attach": need(field("parentId")); need(field("resourceId")); break
    case "canvas.member_add": case "canvas.group_create": case "canvas.group_member_set": need(field("organizationId")); break
    case "canvas.reference_create": need(field("canvasResourceId"), "edit"); need(field("targetResourceId"), "read"); break
    default: need(field("resourceId"))
  }
  return await getDb().begin(async tx => {
    const primaryId = requirements[0]?.id ?? field("resourceId")
    const [resource] = await tx`SELECT organization_id FROM canvas_resources WHERE id=${primaryId}`
    if (!resource) throw new AccessPolicyError("Canvas resource unavailable or access denied")
    await tx`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`canvas-access:${resource.organization_id}`},0))`
    if (name === "canvas.group_member_set") {
      const grants = await tx`SELECT DISTINCT resource_id FROM canvas_resource_grants WHERE organization_id=${field("organizationId")} AND group_id=${field("groupId")}
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>statement_timestamp())`
      for (const grant of grants) need(grant.resource_id)
    }
    if (name === "canvas.workspace_attach") {
      const [workspace] = await tx`SELECT owner_user_id,archived_at FROM workspaces WHERE id=${field("workspaceId")}`
      if (!workspace || workspace.owner_user_id !== principal.userId || workspace.archived_at) throw new AccessPolicyError("Workspace unavailable or access denied")
    }
    if (requirements.length) {
      const snapshot = await loadAccessSnapshot(principal.userId, { resourceIds: [...new Set(requirements.map(item => item.id))] }, tx)
      const resolve = createAccessResolver(snapshot.graph, new Date(snapshot.asOf))
      for (const requirement of requirements) if (!resolve(requirement.id, { kind: "user", userId: principal.userId }).capabilities.includes(requirement.capability)) {
        throw new AccessPolicyError("Canvas resource unavailable or access denied")
      }
    }
    if (result === undefined) return undefined
    const candidate = result && typeof result === "object" && "data" in result ? result.data : result
    const data = validated(mutationData, candidate)
    const expectedIdField = name === "canvas.workspace_attach" || name === "canvas.policy_set" ? "resourceId"
      : name === "canvas.member_add" ? "userId" : name === "canvas.group_member_set" ? "groupId"
        : name === "canvas.revoke" ? "grantId" : "id"
    if (data.id !== field(expectedIdField)) throw new AccessPolicyError("Stored canvas result does not match its command", "unavailable")
    return filterVisibleAccessMutationResult(principal.userId, data, tx)
  }) as AccessMutationResult | undefined
}
