export type CapabilityCeiling = Partial<Record<"read" | "create" | "edit" | "delete" | "comment" | "manage", boolean>>

/** A UI ceiling only narrows existing permissions. Server authorization remains authoritative. */
export function permitsCapability(ceiling: CapabilityCeiling | undefined, capability: keyof CapabilityCeiling): boolean {
  return ceiling === undefined || (ceiling.read === true && ceiling[capability] === true)
}
