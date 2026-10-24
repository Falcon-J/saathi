import { getDb } from '../db/client.ts'

type Profile = { id: string; username: string }
const pendingReads = new Map<string, Promise<Profile | null>>()

export function getProfile(id: string): Promise<Profile | null> {
  const existing = pendingReads.get(id)
  if (existing) return existing
  const result = (async () => {
    const db = getDb()
    const diagnostics = process.env.SSE_PERFORMANCE_DIAGNOSTICS === '1'
    const reserveStarted = diagnostics ? performance.now() : 0
    const reserved = diagnostics ? await db.reserve() : null
    const poolWaitMs = diagnostics ? performance.now() - reserveStarted : 0
    const queryStarted = diagnostics ? performance.now() : 0
    let success = false
    try {
      const rows = await (reserved ?? db)`select id, username from public.profiles where id = ${id} limit 1`
      success = true
      return rows[0] ? { id: rows[0].id as string, username: rows[0].username as string } : null
    } finally {
      reserved?.release()
      if (diagnostics) console.info(JSON.stringify({ ssePhase: 'profile-database', poolWaitMs, queryMs: performance.now() - queryStarted, success }))
    }
  })().finally(() => {
    if (pendingReads.get(id) === result) pendingReads.delete(id)
  })
  pendingReads.set(id, result)
  return result
}

export async function updateProfileUsername(id: string, username: string) {
  const rows = await getDb()`update public.profiles set username = ${username}, updated_at = now() where id = ${id} returning id, username`
  pendingReads.delete(id)
  return rows[0] ? { id: rows[0].id as string, username: rows[0].username as string } : null
}
