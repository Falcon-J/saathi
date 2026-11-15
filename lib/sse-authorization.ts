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
export type WorkspaceMembership = MembershipPair & { sectionAttached?: boolean }
export type FilterAttachedWorkspaces = (actorId: string, rows: { id: string }[]) => Promise<{ id: string }[]>

/** Only SQL-confirmed members reach policy evaluation. Legacy workspaces need no extra read. */
async function filterSectionMemberships(rows: WorkspaceMembership[], filter?: FilterAttachedWorkspaces): Promise<MembershipPair[]> {
  const actors = new Map<string, { id: string }[]>()
  for (const row of rows) if (row.sectionAttached) {
    const workspaces = actors.get(row.actorId) ?? []
    workspaces.push({ id: row.workspaceId })
    actors.set(row.actorId, workspaces)
  }
  if (actors.size && !filter) throw new Error('Workspace policy verifier is required')
  const allowed = new Set<string>()
  await Promise.all([...actors].map(async ([actorId, workspaces]) => {
    const ids = new Set((await filter!(actorId, workspaces)).map(row => row.id))
    for (const row of workspaces) if (ids.has(row.id)) allowed.add(JSON.stringify([row.id, actorId]))
  }))
  return rows.filter(row => !row.sectionAttached || allowed.has(JSON.stringify([row.workspaceId, row.actorId])))
    .map(({ workspaceId, actorId }) => ({ workspaceId, actorId }))
}

/** Batch exact pairs across workspaces; never retain completed decisions. */
export function createBatchedMembershipVerifier(
  read: (pairs: MembershipPair[]) => Promise<WorkspaceMembership[]>,
  filterAttached?: FilterAttachedWorkspaces,
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
              const allowed = new Set((await filterSectionMemberships(await read(pairs), filterAttached)).map(({ workspaceId, actorId }) => JSON.stringify([workspaceId, actorId])))
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
