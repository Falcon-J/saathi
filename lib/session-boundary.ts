export type StoredSession = {
  email: string
  username: string
}

function isStoredSession(value: unknown): value is StoredSession {
  return Boolean(
    value
    && typeof value === "object"
    && "email" in value
    && typeof value.email === "string"
    && "username" in value
    && typeof value.username === "string",
  )
}

export async function loadStoredSession(
  sessionId: string | undefined,
  readSession: (sessionId: string) => Promise<unknown>,
): Promise<StoredSession | null> {
  if (!sessionId) return null

  try {
    const sessionData = await readSession(sessionId)
    if (!sessionData) return null

    const session = typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData
    return isStoredSession(session) ? session : null
  } catch {
    return null
  }
}
