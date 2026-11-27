import { NextResponse, type NextRequest } from "next/server"
import { bootstrap, serverClient } from "@/lib/supabase"

// The link in the sign-in email lands here.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  let ok = false
  if (tokenHash) {
    const supabase = await serverClient()
    const verified = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash })
    ok = !verified.error && (await bootstrap(supabase))
  }
  return NextResponse.redirect(new URL(ok ? "/home" : "/signup?error=expired", request.url))
}
