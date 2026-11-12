import { ACCESS_CAPABILITIES, accessActorSchema, type AccessActor, type AccessCapability, type CanvasReference } from "./contracts.ts"
import { createAccessResolver } from "./policy.ts"
import { loadAccessSnapshot, type AccessDatabase, type AccessSnapshot, type CanvasResourceRecord } from "./repository.ts"
import { AccessPolicyError, requireAccessIdentifier } from "./errors.ts"
import { getDb } from "../../lib/db/client.ts"
export { AccessPolicyError, requireAccessIdentifier } from "./errors.ts"
export type WorkspaceAccess = { attached: boolean; allowed: boolean; capabilities: AccessCapability[] }
export type AuthorizedCanvasResource = CanvasResourceRecord & { capabilities: AccessCapability[] }
export type AuthorizedCanvasView = { resources: AuthorizedCanvasResource[]; references: CanvasReference[] }
export type CanvasAccessDetails = {
  resource: AuthorizedCanvasResource
  grants: Array<{ id: string; principal: { kind: "user" | "group"; id: string; label: string }; capabilities: AccessCapability[]; version: number; expiresAt: string | null; revokedAt: string | null }>
  members: Array<{ id: string; label: string }>
  groups: Array<{ id: string; name: string; version: number; memberIds: string[] }>
}

/** Exported for deterministic acceptance tests and batch callers using the same snapshot. */
export function resolveWorkspaceSnapshot(actor: string | AccessActor, snapshot: AccessSnapshot): Map<string, WorkspaceAccess> {
  const identity: AccessActor = typeof actor === "string" ? { kind: "user", userId: actor } : actor
  const resolve = createAccessResolver(snapshot.graph, new Date(snapshot.asOf))
  return new Map<string, WorkspaceAccess>(snapshot.workspaceMemberships.map((row): [string, WorkspaceAccess] => {
    const attached = row.resourceId !== null
    if (!row.member) return [row.workspaceId, { attached, allowed: false, capabilities: [] }]
    if (!row.resourceId) return [row.workspaceId, { attached: false, allowed: true, capabilities: [...ACCESS_CAPABILITIES] }]
    const decision = resolve(row.resourceId, identity)
    return [row.workspaceId, { attached: true, allowed: decision.allowed, capabilities: decision.capabilities }]
  }))
}

function resolveActor(actor: string | AccessActor): { identity: AccessActor; databaseActorId: string } {
  const identity: AccessActor = typeof actor === "string" ? { kind: "user", userId: actor } : actor
  if (!accessActorSchema.safeParse(identity).success) throw new AccessPolicyError("Invalid canvas actor", "validation")
  requireAccessIdentifier(identity.userId)
  return { identity, databaseActorId: identity.userId }
}

export async function getWorkspaceAccess(actorId: string, workspaceId: string, db?: AccessDatabase): Promise<WorkspaceAccess> {
  requireAccessIdentifier(actorId); requireAccessIdentifier(workspaceId)
  const snapshot = await loadAccessSnapshot(actorId, { workspaceIds: [workspaceId] }, db)
  return resolveWorkspaceSnapshot(actorId, snapshot).get(workspaceId) ?? { attached: false, allowed: false, capabilities: [] }
}

export async function assertWorkspaceAccess(actorId: string, workspaceId: string, capability: AccessCapability, db?: AccessDatabase): Promise<WorkspaceAccess> {
  const access = await getWorkspaceAccess(actorId, workspaceId, db)
  if (!access.allowed || !access.capabilities.includes(capability)) throw new AccessPolicyError("Workspace unavailable or access denied")
  return access
}

export async function filterWorkspaces<T extends { id: string }>(actorId: string, rows: T[], capability: AccessCapability = "read", db?: AccessDatabase,
  projection?: { includeCapabilities: boolean }): Promise<T[]> {
  requireAccessIdentifier(actorId)
  if (!rows.length) return []
  if (rows.length > 10_000) throw new AccessPolicyError("Canvas access batch is too large", "unavailable")
  for (const row of rows) requireAccessIdentifier(row.id)
  const snapshot = await loadAccessSnapshot(actorId, { workspaceIds: rows.map(row => row.id) }, db)
  const access = resolveWorkspaceSnapshot(actorId, snapshot)
  const visible = rows.filter(row => access.get(row.id)?.allowed && access.get(row.id)?.capabilities.includes(capability))
  return projection?.includeCapabilities ? visible.map(row => ({ ...row,
    capabilityCeiling: Object.fromEntries(access.get(row.id)!.capabilities.map(capability => [capability, true])) })) : visible
}

/** Public command projections never expose affected workspaces outside current read membership. */
export async function filterVisibleAccessMutationResult(actorId: string, result: import("./mutations.ts").AccessMutationResult, db?: AccessDatabase): Promise<import("./mutations.ts").AccessMutationResult> {
  const visible = await filterWorkspaces(actorId, result.affectedWorkspaceIds.map(id => ({ id })), "read", db)
  return { ...result, affectedWorkspaceIds: visible.map(row => row.id) }
}

/** Server-internal delivery obligations, never serialize these IDs into a tool/UI response. */
export async function getAccessPlatformPostCommitWorkspaces(actorId: string, commandId: string, db: AccessDatabase = getDb()): Promise<string[]> {
  requireAccessIdentifier(actorId); requireAccessIdentifier(commandId)
  const [receipt] = await db`SELECT result FROM canvas_access_commands WHERE actor_user_id=${actorId} AND command_id=${commandId}`
  const ids: unknown = receipt?.result?.affectedWorkspaceIds
  if (!Array.isArray(ids) || ids.length > 10_000) return []
  for (const id of ids) requireAccessIdentifier(id)
  return ids as string[]
}

export async function listAuthorizedCanvasResources(actor: string | AccessActor, db?: AccessDatabase): Promise<AuthorizedCanvasResource[]> {
  return (await getAuthorizedCanvasView(actor, db)).resources
}

export async function getAuthorizedCanvasView(actor: string | AccessActor, db?: AccessDatabase): Promise<AuthorizedCanvasView> {
  const subject = resolveActor(actor)
  const snapshot = await loadAccessSnapshot(subject.databaseActorId, {}, db)
  return projectAuthorizedCanvasView(subject.identity, snapshot)
}

/** Both endpoints must independently survive current policy and workspace membership. */
export function projectAuthorizedCanvasView(actor: AccessActor, snapshot: AccessSnapshot): AuthorizedCanvasView {
  const resolve = createAccessResolver(snapshot.graph, new Date(snapshot.asOf))
  const workspaceAccess = resolveWorkspaceSnapshot(actor, snapshot)
  const resources = snapshot.records.flatMap(record => {
    if (record.workspaceId && !workspaceAccess.get(record.workspaceId)?.allowed) return []
    const decision = resolve(record.id, actor)
    return decision.allowed ? [{ ...record, capabilities: decision.capabilities }] : []
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const visible = new Set(resources.map(resource => resource.id))
  const records = new Map(resources.map(resource => [resource.id, resource]))
  const references = snapshot.graph.references.filter(reference => visible.has(reference.canvasResourceId) && visible.has(reference.targetResourceId)
    && records.get(reference.canvasResourceId)!.organizationId === records.get(reference.targetResourceId)!.organizationId)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return { resources, references }
}

export async function getCanvasAccessDetails(actorId: string, resourceId: string): Promise<CanvasAccessDetails> {
  requireAccessIdentifier(actorId); requireAccessIdentifier(resourceId)
  return await getDb().begin(async tx => {
    const [resource] = await tx`SELECT organization_id FROM canvas_resources WHERE id=${resourceId}`
    if (!resource) throw new AccessPolicyError("Canvas resource unavailable or access denied")
    await tx`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`canvas-access:${resource.organization_id}`},0))`
    const snapshot = await loadAccessSnapshot(actorId, { resourceIds: [resourceId] }, tx)
    const decision = createAccessResolver(snapshot.graph, new Date(snapshot.asOf))(resourceId, { kind: "user", userId: actorId })
    const record = snapshot.records.find(row => row.id === resourceId)
    if (!record || !decision.capabilities.includes("manage")) throw new AccessPolicyError("Canvas resource unavailable or access denied")
    const members = await tx`SELECT p.id,p.username AS label FROM canvas_organization_members m JOIN profiles p ON p.id=m.user_id
      WHERE m.organization_id=${resource.organization_id} AND m.revoked_at IS NULL ORDER BY p.username,p.id LIMIT 10001`
    const groups = await tx`SELECT g.id,g.name,g.version,COALESCE(array_agg(m.user_id) FILTER (WHERE m.user_id IS NOT NULL AND m.revoked_at IS NULL),ARRAY[]::uuid[]) AS member_ids
      FROM canvas_groups g LEFT JOIN canvas_group_members m ON m.group_id=g.id AND m.organization_id=g.organization_id
      WHERE g.organization_id=${resource.organization_id} GROUP BY g.id ORDER BY g.name,g.id LIMIT 10001`
    const grants = await tx`SELECT g.id,g.capabilities,g.version,g.expires_at,g.revoked_at,g.user_id,g.group_id,
      COALESCE(p.username,cg.name) AS label FROM canvas_resource_grants g LEFT JOIN profiles p ON p.id=g.user_id
      LEFT JOIN canvas_groups cg ON cg.id=g.group_id WHERE g.resource_id=${resourceId} ORDER BY g.id LIMIT 10001`
    if (members.length > 10_000 || groups.length > 10_000 || grants.length > 10_000) throw new AccessPolicyError("Canvas access batch is too large", "unavailable")
    return { resource: { ...record, capabilities: decision.capabilities }, members: members.map(row => ({ id: row.id, label: row.label })),
      groups: groups.map(row => ({ id: row.id, name: row.name, version: row.version, memberIds: row.member_ids })),
      grants: grants.map(row => ({ id: row.id, principal: { kind: row.user_id ? "user" as const : "group" as const,
        id: row.user_id ?? row.group_id, label: row.label }, capabilities: row.capabilities, version: row.version,
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null, revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null })) }
  }) as CanvasAccessDetails
}

export { createCompany, createCanvasContainer, attachWorkspace, addOrganizationMember, createCanvasGroup,
  setCanvasGroupMembership, grantCanvasAccess, revokeCanvasGrant, setCanvasResourcePolicy, createCanvasReference } from "./mutations.ts"
export type { AccessMutationResult } from "./mutations.ts"
