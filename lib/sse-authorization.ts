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

export type MembershipPair = { workspaceId: string; actorId: string }

/** Batch exact pairs across workspaces; never retain completed decisions. */
export function createBatchedMembershipVerifier(
  read: (pairs: MembershipPair[]) => Promise<MembershipPair[]>,
) {
  type Request = MembershipPair & { resolve: (allowed: boolean) => void; reject: (error: unknown) => void }
  let queued: Map<string, Request> | undefined
  let active: Promise<void> | undefined
  const pending = new Map<string, Promise<boolean>>()
  return (workspaceId: string, actorId: string): Promise<boolean> => {
    const key = JSON.stringify([workspaceId, actorId])
    const existing = pending.get(key)
    if (existing) return existing
    if (!queued) {
      queued = new Map()
      const requests = queued
      setTimeout(() => {
        void (async () => {
          await active
          queued = undefined
          const operation = (async () => {
            try {
              const pairs = [...requests.values()].map(({ workspaceId, actorId }) => ({ workspaceId, actorId }))
              const allowed = new Set((await read(pairs)).map(({ workspaceId, actorId }) => JSON.stringify([workspaceId, actorId])))
              for (const [pairKey, request] of requests) request.resolve(allowed.has(pairKey))
            } catch (error) {
              for (const request of requests.values()) request.reject(error)
            }
          })()
          active = operation
          await operation
          if (active === operation) active = undefined
        })()
      }, 10)
    }
    const requests = queued
    const result = new Promise<boolean>((resolve, reject) => requests.set(key, { workspaceId, actorId, resolve, reject }))
      .finally(() => pending.delete(key))
    pending.set(key, result)
    return result
  }
}
