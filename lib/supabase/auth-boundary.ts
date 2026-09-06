export function safeAuthRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s]|%5c|%2f/i.test(value)) return '/dashboard'
  return value
}

export function validateCredentials(email: string, password: string, username?: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return 'Please enter a valid email address.'
  if (password.length < 8 || password.length > 128) return 'Password must be 8–128 characters.'
  return username === undefined ? null : validateUsername(username)
}

export function validateUsername(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 50 || !/^[a-zA-Z0-9_ -]+$/.test(value)) return 'Username must be 2–50 characters, using letters, numbers, spaces, hyphens, or underscores.'
  return null
}

export function isSameOrigin(origin: string | null, requestUrl: string): boolean {
  try { return !!origin && new URL(origin).origin === new URL(requestUrl).origin }
  catch { return false }
}

type VerifiedUser = { id: string; email?: string; email_confirmed_at?: string }
type Profile = { id: string; username: string }

// This accepts only an identity already verified by Supabase getUser(), never cookie contents.
export async function resolveVerifiedSession(user: VerifiedUser | null, lookup: (id: string) => Promise<Profile | null>) {
  if (!user?.id || !user.email || !user.email_confirmed_at) return null
  const profile = await lookup(user.id)
  if (!profile || profile.id !== user.id) return null
  return { id: user.id, email: user.email.trim().toLowerCase(), username: profile.username }
}
