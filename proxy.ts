import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const appPaths = ["/home", "/tasks", "/plan", "/agents", "/activity", "/settings"]

// Refresh the session cookie on every page load, and send people to the right side of the sign-in wall.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const path = request.nextUrl.pathname
  const to = (p: string) => {
    const redirect = NextResponse.redirect(new URL(p, request.url))
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }
  if (!signedIn && appPaths.some((p) => path === p || path.startsWith(p + "/"))) return to("/signup")
  if (signedIn && path === "/signup") return to("/home")
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|auth/|mcp|api/|.*\\.(?:svg|png|ico|woff2)$).*)"],
}
