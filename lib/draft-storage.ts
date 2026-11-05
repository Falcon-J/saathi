/** Session-only draft storage; unavailable or corrupt storage never blocks editing. */
export function readDraft<T>(key: string | undefined, valid: (value: unknown) => value is T): T | null {
  if (!key) return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (valid(value)) return value
    sessionStorage.removeItem(key)
  } catch { /* Storage is optional. */ }
  return null
}

export function writeDraft(key: string | undefined, value: unknown): void {
  if (!key) return
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* Keep the in-memory draft. */ }
}

export function removeDraft(key: string | undefined): void {
  if (!key) return
  try { sessionStorage.removeItem(key) } catch { /* Storage is optional. */ }
}

export function clearWorkspaceDrafts(scope: string): void {
  for (const suffix of [':settings', ':quick-add', ':task-editor']) removeDraft(scope + suffix)
}

export function isDraftRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Clear only this account's namespace after a confirmed sign-out. */
export function clearAccountDrafts(prefix: string): void {
  if (!prefix) return
  try {
    // Reverse iteration keeps remaining indexes stable while removing entries.
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(prefix)) removeDraft(key)
    }
  } catch { /* Storage failure must not prevent sign-out. */ }
}
