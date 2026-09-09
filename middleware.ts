import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseConfig } from './lib/supabase/config'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const protectedPage = request.nextUrl.pathname === '/dashboard' || request.nextUrl.pathname.startsWith('/dashboard/')
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
  } catch {
    if (protectedPage) return new NextResponse('Account service temporarily unavailable. Please reload shortly.', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
