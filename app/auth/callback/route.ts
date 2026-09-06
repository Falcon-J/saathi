import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeAuthRedirect } from '@/lib/supabase/auth-boundary'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const next = safeAuthRedirect(request.nextUrl.searchParams.get('next'))
  try {
    if (code) {
      const client = await createClient()
      const { error } = await client.auth.exchangeCodeForSession(code)
      if (!error) {
        const response = NextResponse.redirect(new URL(next, request.url))
        response.headers.set('Cache-Control', 'private, no-store')
        return response
      }
    }
  } catch { /* The visible error page offers a new sign-in or recovery attempt. */ }
  return NextResponse.redirect(new URL('/auth/error', request.url))
}
