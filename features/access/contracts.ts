import { z } from "zod"

export const ACCESS_CAPABILITIES = ["read", "create", "edit", "comment", "manage", "delete"] as const
/** Maximum number of canonical parent edges, with an organization at depth zero. */
export const MAX_RESOURCE_DEPTH = 16
const identifier = z.string().min(1).max(200).refine(value => value.trim() === value, "Identifiers cannot contain surrounding whitespace")
const instant = z.iso.datetime({ offset: true })
export const accessCapabilitySchema = z.enum(ACCESS_CAPABILITIES)
export const capabilitySetSchema = z.array(accessCapabilitySchema).min(1).max(ACCESS_CAPABILITIES.length)
  .refine(values => new Set(values).size === values.length, "Capabilities must be unique")
  .refine(values => values.includes("read"), "Every grant must explicitly include read")
export const accessResourceSchema = z.object({
  id: identifier,
  kind: z.enum(["organization", "space", "section", "workspace"]),
  parentId: identifier.nullable(),
  mode: z.enum(["inherit", "restricted"]),
}).strict()
export const accessPrincipalSchema = z.object({ kind: z.enum(["user", "group"]), id: identifier }).strict()
export const accessGrantSchema = z.object({
  id: identifier, resourceId: identifier, principal: accessPrincipalSchema, capabilities: capabilitySetSchema,
  expiresAt: instant.nullish(), revokedAt: instant.nullish(),
}).strict()
export const groupMembershipSchema = z.object({
  organizationId: identifier, groupId: identifier, userId: identifier, revokedAt: instant.nullish(),
}).strict()
export const accessActorSchema = z.object({ kind: z.literal("user"), userId: identifier }).strict()
/** Canvas placement is independent of ownership and conveys no authority over the target. */
export const canvasReferenceSchema = z.object({ id: identifier, canvasResourceId: identifier, targetResourceId: identifier }).strict()
/** Supply trusted human policy facts. OAuth application grants remain a separate intersection. */
export const accessGraphSchema = z.object({
  resources: z.array(accessResourceSchema).max(10_000),
  grants: z.array(accessGrantSchema).max(50_000),
  memberships: z.array(groupMembershipSchema).max(50_000),
  references: z.array(canvasReferenceSchema).max(50_000),
}).strict()

export type AccessCapability = z.infer<typeof accessCapabilitySchema>
export type AccessResource = z.infer<typeof accessResourceSchema>
export type AccessPrincipal = z.infer<typeof accessPrincipalSchema>
export type AccessGrant = z.infer<typeof accessGrantSchema>
export type GroupMembership = z.infer<typeof groupMembershipSchema>
export type AccessActor = z.infer<typeof accessActorSchema>
export type CanvasReference = z.infer<typeof canvasReferenceSchema>
export type AccessGraph = z.infer<typeof accessGraphSchema>
export type AccessDenialReason = "invalid_graph" | "invalid_actor" | "invalid_time" | "unknown_resource" | "no_grant"
export type AccessDecision = { allowed: boolean; capabilities: AccessCapability[]; reason: "granted" | AccessDenialReason }
