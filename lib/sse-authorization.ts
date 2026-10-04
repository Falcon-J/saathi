/** Share concurrent reads only. Completed authorization decisions are never cached. */
export function createMembershipVerifier(read: (workspaceId: string, actorId: string) => Promise<boolean>) {
  const pending = new Map<string, Promise<boolean>>()
  return (workspaceId: string, actorId: string): Promise<boolean> => {
    const key = JSON.stringify([workspaceId, actorId])
    const existing = pending.get(key)
    if (existing) return existing
    const result = read(workspaceId, actorId).finally(() => pending.delete(key))
    pending.set(key, result)
    return result
  }
}
