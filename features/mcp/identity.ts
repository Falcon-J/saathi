import type { McpActor } from './auth.ts'

interface IdentityDependencies {
  getUser: (accessToken: string) => Promise<{ data: { user: { id: string; email?: string; email_confirmed_at?: string } | null }; error: { status?: number } | null }>
  getProfile: (userId: string) => Promise<{ id: string } | null>
}

/** Preserve provider outages as unavailable; only a credential rejection is unauthenticated. */
export async function resolveMcpActor(input: { userId: string; accessToken: string }, dependencies: IdentityDependencies): Promise<McpActor | null> {
  const { data, error } = await dependencies.getUser(input.accessToken)
  if (error) {
    if (error.status === 401 || error.status === 403) return null
    throw new Error('Identity service is unavailable')
  }
  if (!data.user || data.user.id !== input.userId || !data.user.email) return null
  const profile = await dependencies.getProfile(input.userId)
  return profile ? { id: input.userId, email: data.user.email, emailConfirmed: Boolean(data.user.email_confirmed_at), profileId: profile.id } : null
}
