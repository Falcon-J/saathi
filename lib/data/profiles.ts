import { getDb } from '../db/client'

export async function getProfile(id: string): Promise<{ id: string; username: string } | null> {
  const rows = await getDb()`select id, username from public.profiles where id = ${id} limit 1`
  return rows[0] ? { id: rows[0].id as string, username: rows[0].username as string } : null
}

export async function updateProfileUsername(id: string, username: string) {
  const rows = await getDb()`update public.profiles set username = ${username}, updated_at = now() where id = ${id} returning id, username`
  return rows[0] ? { id: rows[0].id as string, username: rows[0].username as string } : null
}
