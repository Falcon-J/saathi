"use server"

import { cookies } from 'next/headers'
import { createClient } from './supabase/server'
import { getAuthCallbackUrl } from './supabase/config'
import { validateCredentials, resolveVerifiedSession, safeAuthRedirect } from './supabase/auth-boundary'
import { getProfile } from './data/profiles'
import { normalizeEmail } from './identity'

type AuthResult = { success?: boolean; error?: string; confirmationRequired?: boolean; message?: string }
type OAuthResult = { url?: string; error?: string }
const unavailable = { error: 'Account service is temporarily unavailable. Please try again.' }

export async function signup(email: string, username: string, password: string): Promise<AuthResult> {
  if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string') return { error: 'Enter valid account details.' }
  const normalizedEmail = normalizeEmail(email)
  const invalid = validateCredentials(normalizedEmail, password, username)
  if (invalid) return { error: invalid }
  try {
    const client = await createClient()
    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { username: username.trim() }, emailRedirectTo: getAuthCallbackUrl() },
    })
    if (error) return { error: 'Could not create the account. Check your details or try signing in.' }
    // Launch requires verified email. Supabase must have email confirmation enabled.
    if (data.session && !data.user?.email_confirmed_at) await client.auth.signOut({ scope: 'local' })
    return { success: true, confirmationRequired: !data.session || !data.user?.email_confirmed_at, message: 'Check your email to verify your account. If you already have an account, sign in or reset your password.' }
  } catch { return unavailable }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  if (typeof email !== 'string' || typeof password !== 'string') return { error: 'Enter your email and password.' }
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !password || password.length > 128) return { error: 'Enter your email and password.' }
  try {
    const client = await createClient()
    const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password })
    if (error || !data.user?.email_confirmed_at) return { error: 'Unable to sign in. Check your email and password, and verify your email before signing in.' }
    return { success: true }
  } catch { return unavailable }
}

export async function loginWithGoogle(next?: string | null): Promise<OAuthResult> {
  try {
    const client = await createClient()
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getAuthCallbackUrl(safeAuthRedirect(next)) },
    })
    if (error || !data.url) return { error: 'Could not start Google sign-in. Please try again.' }
    return { url: data.url }
  } catch { return unavailable }
}

export async function logout(): Promise<AuthResult> {
  try {
    const client = await createClient()
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) return { error: 'Could not sign out. Please try again.' }
    // Remove any obsolete cookie left over from the pre-Supabase release.
    const store = await cookies()
    store.delete('auth-session')
    return { success: true }
  } catch { return unavailable }
}

export async function getSession() {
  try {
    const client = await createClient({ readOnly: true })
    const { data: { user }, error } = await client.auth.getUser()
    if (error) {
      if (!error.status || error.status >= 500) throw new Error('Account service unavailable')
      return null
    }
    return await resolveVerifiedSession(user, getProfile)
  } catch {
    throw new Error('Account service is temporarily unavailable. Please try again.')
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (typeof email !== 'string') return { error: 'Please enter a valid email address.' }
  const normalizedEmail = normalizeEmail(email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 255) return { error: 'Please enter a valid email address.' }
  try {
    const client = await createClient()
    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: getAuthCallbackUrl('/reset-password') })
    if (error) return { error: 'Could not request a reset email. Please wait and try again.' }
    return { success: true, message: 'If an account exists for this email, you will receive a password reset link. Open it in this browser.' }
  } catch { return unavailable }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return { error: 'Password must be 8–128 characters.' }
  try {
    const client = await createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user?.email_confirmed_at) return { error: 'This recovery session has expired. Request a new reset link.' }
    const { error } = await client.auth.updateUser({ password })
    if (error) return { error: 'Could not update the password. Use a different password or request a new reset link.' }
    const { error: logoutError } = await client.auth.signOut({ scope: 'local' })
    return { success: true, message: logoutError ? 'Password updated. Sign out from the workspace when you finish.' : 'Password updated. Sign in with your new password.' }
  } catch { return unavailable }
}
