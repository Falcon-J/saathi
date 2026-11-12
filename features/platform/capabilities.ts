import { platformContracts } from "./contracts.ts"
import { coordinationCapabilities } from "../coordination/capabilities.ts"
import { accessToolSchemas } from "../access/platform.ts"
import type { PlatformToolName } from "./contracts.ts"

export type PlatformCapability = Readonly<{
  name: string
  kind: "read" | "mutate"
  requiredScopes: readonly string[]
  destructive: boolean
  securitySensitive: boolean
  available: boolean
  unavailableReason?: string
  support: "domain-supported" | "unsupported"
  contractVersion: 1
}>
const reads = new Set<PlatformToolName>(["workspaces.list", "workspaces.get", "members.list", "invitation_links.preview", "invitations.list", "tasks.list", "tasks.get", "dependencies.get", "comments.list", "activity.list", "archives.list", "archives.get", "usage.get", "capabilities.list", "agent_runs.list", "agent_runs.get"])
const destructive = new Set<PlatformToolName>(["workspaces.delete", "workspaces.archive", "members.remove", "members.leave", "tasks.delete", "invitation_links.revoke", "invitations.revoke"])
const sensitive = new Set<PlatformToolName>(["workspaces.transfer_ownership", "members.remove", "members.leave", "invitation_links.create", "invitation_links.preview", "invitation_links.accept", "invitation_links.revoke", "invitations.send", "invitations.accept", "invitations.decline", "invitations.revoke", "workspaces.delete"])
function describe(name: PlatformToolName): PlatformCapability {
  if (name.startsWith("agent_runs.")) {
    const capability = coordinationCapabilities.find(item => item.name === name)
    if (!capability) throw new Error("Coordination capability is not registered")
    return capability
  }
  if (name.startsWith("canvas.")) {
    const spec = accessToolSchemas[name as keyof typeof accessToolSchemas]
    const privilege = name === "canvas.resources" ? "read" : name === "canvas.access_details" ? "access_read" : name.slice(7)
    return Object.freeze({ name, kind: spec.kind, requiredScopes: Object.freeze([`canvas:${privilege}`]), destructive: spec.destructive, securitySensitive: spec.securitySensitive, available: true, support: "domain-supported", contractVersion: 1 })
  }
  const domain = name.split(".")[0]
  const kind = reads.has(name) ? "read" : "mutate"
  const privilege = name === "workspaces.transfer_ownership" ? "transfer" : name.endsWith(".archive") ? "archive" : name.endsWith(".revoke") ? "revoke" : name.endsWith(".delete") ? "delete" : kind === "read" ? "read" : "write"
  return Object.freeze({ name, kind, requiredScopes: Object.freeze([`${domain}:${privilege}`]), destructive: destructive.has(name), securitySensitive: sensitive.has(name), available: true, support: "domain-supported", contractVersion: 1 })
}
/** available means an existing domain operation has a contract, not an installed dispatcher.
 * No tools in this registry are executable until a separately authenticated adapter is installed.
 * requiredScopes are application delegation capabilities, not provider OAuth scopes.
 * Each adapter must authenticate and authorize every dispatch. */
export const platformCapabilities: readonly PlatformCapability[] = Object.freeze([
  ...(Object.keys(platformContracts) as PlatformToolName[]).map(describe),
])
/** Supply only server-verified scopes. Tool annotations never grant privileges. */
export function discoverCapabilities(options: { scopes: readonly string[]; readOnly?: boolean }): readonly PlatformCapability[] {
  const scopes = new Set(options.scopes)
  return platformCapabilities.filter(capability => capability.available && (!options.readOnly || capability.kind === "read") && capability.requiredScopes.every(scope => scopes.has(scope)))
}
export function getPlatformCapability(name: string): PlatformCapability | undefined {
  return platformCapabilities.find(capability => capability.name === name)
}
