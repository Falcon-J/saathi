import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Get the session cookie
    const sessionCookie = request.cookies.get('auth-session')
    const hasSessionCookie = !!sessionCookie?.value

    // Define protected routes
    const protectedRoutes = ['/dashboard']
    // Check if the current path is protected
    const isProtectedRoute = protectedRoutes.some(route =>
        pathname.startsWith(route)
    )

    // Redirect unauthenticated users from protected routes to login
    if (isProtectedRoute && !hasSessionCookie) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/dashboard/:path*', '/login', '/register'],
}
