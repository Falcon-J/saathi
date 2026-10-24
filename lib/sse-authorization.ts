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

/** Batch concurrent fresh checks by workspace; never retain completed decisions. */
export function createBatchedMembershipVerifier(
  read: (workspaceId: string, actorIds: string[]) => Promise<string[]>,
) {
  type Request = { resolve: (allowed: boolean) => void; reject: (error: unknown) => void }
  const queued = new Map<string, Map<string, Request>>()
  const active = new Map<string, Promise<void>>()
  const pending = new Map<string, Promise<boolean>>()
  return (workspaceId: string, actorId: string): Promise<boolean> => {
    const key = JSON.stringify([workspaceId, actorId])
    const existing = pending.get(key)
    if (existing) return existing
    let batch = queued.get(workspaceId)
    if (!batch) {
      batch = new Map()
      queued.set(workspaceId, batch)
      const requests = batch
      setTimeout(() => {
        void (async () => {
          await active.get(workspaceId)
          queued.delete(workspaceId)
          const operation = (async () => {
            try {
              const allowed = new Set(await read(workspaceId, [...requests.keys()]))
              for (const [actor, request] of requests) request.resolve(allowed.has(actor))
            } catch (error) {
              for (const request of requests.values()) request.reject(error)
            }
          })()
          active.set(workspaceId, operation)
          await operation
          if (active.get(workspaceId) === operation) active.delete(workspaceId)
        })()
      }, 10)
    }
    const result = new Promise<boolean>((resolve, reject) => batch!.set(actorId, { resolve, reject }))
      .finally(() => pending.delete(key))
    pending.set(key, result)
    return result
  }
}
