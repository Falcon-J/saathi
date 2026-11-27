import { NextResponse, type NextRequest } from "next/server"
import { bootstrap, serverClient } from "@/lib/supabase"

// GitHub sends people back here with a code. `popup=1` means the sign-up page opened it in a popup.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const popup = q.get("popup") === "1"
  let error = q.get("error") === "access_denied" ? "cancelled" : "failed"
  const code = q.get("code")
  if (code) {
    const supabase = await serverClient()
    const exchanged = await supabase.auth.exchangeCodeForSession(code)
    if (!exchanged.error && (await bootstrap(supabase))) error = ""
  }
  const page = popup ? "/auth/done" : error ? "/signup" : "/home"
  return NextResponse.redirect(new URL(error ? `${page}?error=${error}` : page, request.url))
}
