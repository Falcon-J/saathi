import { ACCESS_CAPABILITIES, MAX_RESOURCE_DEPTH, accessActorSchema, accessGraphSchema,
  type AccessActor, type AccessCapability, type AccessDecision, type AccessDenialReason,
  type AccessGraph, type AccessResource } from "./contracts.ts"

const denied = (reason: AccessDenialReason): AccessDecision => ({ allowed: false, capabilities: [], reason })
const unique = (ids: string[]) => new Set(ids).size === ids.length

function validHierarchy(graph: AccessGraph, resources: Map<string, AccessResource>): boolean {
  if (!unique(graph.resources.map(resource => resource.id)) || !unique(graph.grants.map(grant => grant.id))
    || !unique(graph.references.map(reference => reference.id))
    || !unique(graph.memberships.map(member => JSON.stringify([member.organizationId, member.groupId, member.userId])))) return false
  for (const resource of graph.resources) {
    if (resource.kind === "organization") {
      if (resource.parentId !== null || resource.mode !== "restricted") return false
    } else {
      const parent = resource.parentId ? resources.get(resource.parentId) : undefined
      if (!parent) return false
      if (resource.kind === "space" && parent.kind !== "organization") return false
      if (resource.kind === "section" && !["organization", "space", "section"].includes(parent.kind)) return false
      if (resource.kind === "workspace" && !["space", "section"].includes(parent.kind)) return false
    }
    const seen = new Set<string>()
    let cursor: AccessResource | undefined = resource
    while (cursor) {
      if (seen.has(cursor.id) || seen.size > MAX_RESOURCE_DEPTH) return false
      seen.add(cursor.id)
      if (cursor.parentId === null) {
        if (cursor.kind !== "organization") return false
        break
      }
      cursor = resources.get(cursor.parentId)
      if (!cursor) return false
    }
  }
  return graph.grants.every(grant => resources.has(grant.resourceId))
}

function canonicalPath(resourceId: string, resources: Map<string, AccessResource>): AccessResource[] {
  const path: AccessResource[] = []
  let cursor = resources.get(resourceId)
  while (cursor) {
    path.push(cursor)
    cursor = cursor.parentId ? resources.get(cursor.parentId) : undefined
  }
  return path.reverse()
}

type PrincipalGrantCache = Map<string, Map<string, AccessGraph["grants"]>>
function humanCapabilities(userId: string, path: AccessResource[], graph: AccessGraph, now: number, cache: PrincipalGrantCache): Set<AccessCapability> {
  const organizationId = path[0].id
  const key = JSON.stringify([userId, organizationId])
  let grantsByResource = cache.get(key)
  if (!grantsByResource) {
    const groups = new Set(graph.memberships.filter(member => member.organizationId === organizationId && member.userId === userId && !member.revokedAt)
      .map(member => member.groupId))
    grantsByResource = new Map<string, AccessGraph["grants"]>()
    for (const grant of graph.grants) {
      if (grant.revokedAt || (grant.expiresAt && Date.parse(grant.expiresAt) <= now)) continue
      if (!(grant.principal.kind === "user" ? grant.principal.id === userId : groups.has(grant.principal.id))) continue
      const matches = grantsByResource.get(grant.resourceId) ?? []
      matches.push(grant)
      grantsByResource.set(grant.resourceId, matches)
    }
    cache.set(key, grantsByResource)
  }
  const effective = new Set<AccessCapability>()
  for (const resource of path) {
    if (resource.mode === "restricted") effective.clear()
    for (const grant of grantsByResource.get(resource.id) ?? []) {
      for (const capability of grant.capabilities) effective.add(capability)
    }
  }
  return effective
}

/** Pure authorization projection over trusted current facts and an explicit clock.
 * No organization owner/admin bypass exists. Manage never opens restricted descendants.
 * References and invitation links do not participate in the canonical authorization path.
 */
export function resolveEffectiveAccess(resourceId: string, actor: AccessActor, graph: AccessGraph, now: Date): AccessDecision {
  return createAccessResolver(graph, now)(resourceId, actor)
}

/** Compile one authoritative snapshot once for a batch. Never cache across requests or commits. */
export function createAccessResolver(graph: AccessGraph, now: Date): (resourceId: string, actor: AccessActor) => AccessDecision {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return () => denied("invalid_time")
  const timestamp = now.getTime()
  const parsed = accessGraphSchema.safeParse(graph)
  if (!parsed.success) return () => denied("invalid_graph")
  const facts = parsed.data
  const resources = new Map(facts.resources.map(resource => [resource.id, resource]))
  if (!validHierarchy(facts, resources)) return () => denied("invalid_graph")
  const cache: PrincipalGrantCache = new Map()
  return (resourceId, actor) => {
    const identity = accessActorSchema.safeParse(actor)
    if (!identity.success) return denied("invalid_actor")
    if (!resources.has(resourceId)) return denied("unknown_resource")
    const path = canonicalPath(resourceId, resources)
    const capabilities = humanCapabilities(identity.data.userId, path, facts, timestamp, cache)
    if (!capabilities.has("read")) return denied("no_grant")
    return { allowed: true, capabilities: ACCESS_CAPABILITIES.filter(capability => capabilities.has(capability)), reason: "granted" }
  }
}
