import type { PlatformCapability } from '../platform/capabilities.ts'
import { coordinationToolSchemas, coordinationScopeFor } from './contracts.ts'
import type { CoordinationToolName } from './contracts.ts'
export const coordinationCapabilities: readonly PlatformCapability[] = Object.freeze((Object.keys(coordinationToolSchemas) as CoordinationToolName[]).map(name => {
  const destructive = name === 'agent_runs.cancel' || name === 'agent_runs.release'
  return Object.freeze({ name, kind: coordinationToolSchemas[name].kind, requiredScopes: Object.freeze([coordinationScopeFor(name)]), destructive, securitySensitive: destructive, available: true, support: 'domain-supported' as const, contractVersion: 1 as const })
}))
