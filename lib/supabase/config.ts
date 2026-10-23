export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Authentication is not configured')
  return { url, key }
}

export function getAuthCallbackUrl(next = '/dashboard') {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (!configured) throw new Error('Application URL is not configured')
  const origin = new URL(configured)
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) {
    throw new Error('Application URL must use HTTPS')
  }
  const callback = new URL('/auth/callback', origin)
  callback.searchParams.set('next', next)
  return callback.toString()
}

export function getCanonicalAuthEntryUrl(requestUrl: string): URL | null {
  const request = new URL(requestUrl)
  if (!['/login', '/register', '/forgot-password'].includes(request.pathname)) return null
  const origin = new URL(getAuthCallbackUrl()).origin
  if (request.origin === origin) return null
  const target = new URL(request.pathname, origin)
  // Only entry-page state crosses origins; callback codes and sessions never do.
  for (const key of ['redirect', 'reset']) {
    const value = request.searchParams.get(key)
    if (value) target.searchParams.set(key, value)
  }
  return target
}
