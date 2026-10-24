import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getCanonicalAuthEntryUrl, getSupabaseConfig } from './lib/supabase/config'

export async function proxy(request: NextRequest) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      const entry = getCanonicalAuthEntryUrl(request.url, request.headers.get('host'))
      if (entry) {
        const redirect = NextResponse.redirect(entry)
        redirect.headers.set('Cache-Control', 'private, no-store')
        return redirect
      }
    } catch {
      return new NextResponse('Account service temporarily unavailable. Please reload shortly.', { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
  }
  let response = NextResponse.next({ request })
  const protectedPage = request.nextUrl.pathname === '/dashboard' || request.nextUrl.pathname.startsWith('/dashboard/')
  const refreshOnly = request.nextUrl.pathname.startsWith('/api/') || (request.method === 'POST' && Boolean(request.headers.get('next-action')?.trim()))
  try {
    const { url, key } = getSupabaseConfig()
    const client = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })
    if (refreshOnly) {
      // Actions and API handlers own live user and permission checks; this only refreshes session cookies.
      await client.auth.getClaims()
    } else {
      const { data: { user }, error } = await client.auth.getUser()
      if (protectedPage && error && (!error.status || error.status >= 500)) return new NextResponse('Account service temporarily unavailable. Please reload shortly.', { status: 503, headers: { 'Cache-Control': 'no-store' } })
      if (protectedPage && (error || !user?.email_confirmed_at)) {
        const login = new URL('/login', request.url)
        login.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search)
        const redirect = NextResponse.redirect(login)
        response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
        redirect.headers.set('Cache-Control', 'private, no-store')
        return redirect
      }
    }
  } catch {
    if (protectedPage && !refreshOnly) return new NextResponse('Account service temporarily unavailable. Please reload shortly.', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
